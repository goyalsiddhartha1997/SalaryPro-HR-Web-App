/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Check, 
  Search, 
  Layers, 
  Calendar as CalendarIcon, 
  Clock, 
  X, 
  Info, 
  AlertCircle,
  FileSpreadsheet,
  Save,
  ArrowRight,
  TrendingUp,
  SlidersHorizontal,
  ChevronRight,
  FileText,
  Activity,
  CheckCircle,
  BarChart4,
  ExternalLink,
  PlusCircle,
  Settings,
  Hammer
} from 'lucide-react';
import { LoomOrder, LoomOrderRow } from '../types';
import * as XLSX from 'xlsx';

interface LoomOrdersProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function LoomOrders({ triggerAlert, viewOnly = false }: LoomOrdersProps) {
  // --- REAL-TIME FIRESTORE STREAM ---
  const [orders, setOrders] = useState<LoomOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // --- MODAL & CURRENT ORDER SELECTION ---
  const [activeModalOrderId, setActiveModalOrderId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // --- PARENT ORDER CREATION STATES ---
  const [newOrderNo, setNewOrderNo] = useState<string>('');
  const [newOrderDate, setNewOrderDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [newOrderStatus, setNewOrderStatus] = useState<'Pending' | 'Production' | 'Completed'>('Pending');
  const [isCreatingParent, setIsCreatingParent] = useState<boolean>(false);

  // --- MODAL SPECIFIC STATES FOR PARENT INFO EDIT ---
  const [isEditingParentInfo, setIsEditingParentInfo] = useState<boolean>(false);
  const [editedOrderNo, setEditedOrderNo] = useState<string>('');
  const [editedOrderDate, setEditedOrderDate] = useState<string>('');
  const [editedOrderStatus, setEditedOrderStatus] = useState<'Pending' | 'Production' | 'Completed'>('Pending');

  // --- NEW SUB-ORDER FORM STATES (USED IN BOTH SIDEBAR & MODAL) ---
  const [subSize, setSubSize] = useState<string>('');
  const [subQuality, setSubQuality] = useState<string>('');
  const [subGsm, setSubGsm] = useState<string>('');
  const [subDenier, setSubDenier] = useState<string>('');
  const [subFabricWeight, setSubFabricWeight] = useState<string>('');
  const [subTotalQuantity, setSubTotalQuantity] = useState<string>('');
  const [subRemarks, setSubRemarks] = useState<string>('');
  const [subItemStatus, setSubItemStatus] = useState<'Pending' | 'Production' | 'Completed'>('Pending');
  const [subNoOfRolls, setSubNoOfRolls] = useState<string>('');
  const [subLaminationSelection, setSubLaminationSelection] = useState<string>('LAMINATION');
  const [subLaminationCustom, setSubLaminationCustom] = useState<string>('');

  // --- INLINE SUB-ORDER EDIT STATES ---
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [inlineSize, setInlineSize] = useState<string>('');
  const [inlineQuality, setInlineQuality] = useState<string>('');
  const [inlineGsm, setInlineGsm] = useState<string>('');
  const [inlineDenier, setInlineDenier] = useState<string>('');
  const [inlineFabricWeight, setInlineFabricWeight] = useState<string>('');
  const [inlineTotalQuantity, setInlineTotalQuantity] = useState<string>('');
  const [inlineProductionCompleted, setInlineProductionCompleted] = useState<string>('');
  const [inlineRemarks, setInlineRemarks] = useState<string>('');
  const [inlineRowStatus, setInlineRowStatus] = useState<'Pending' | 'Production' | 'Completed'>('Pending');
  const [inlineNoOfRolls, setInlineNoOfRolls] = useState<string>('');
  const [inlineLaminationSelection, setInlineLaminationSelection] = useState<string>('LAMINATION');
  const [inlineLaminationCustom, setInlineLaminationCustom] = useState<string>('');

  // --- FILTER & SEARCH STATES ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchDate, setSearchDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // --- DELETE CONFIRMATION ---
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmSubIdx, setDeleteConfirmSubIdx] = useState<number | null>(null);

  // Stream active loom orders from Firestore
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'loomOrders');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: LoomOrder[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as LoomOrder);
      });
      // Sort: newest first
      list.sort((a, b) => {
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to stream loom orders", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute selected order (modal & sidebar)
  const modalOrder = useMemo(() => {
    return orders.find(o => o.id === activeModalOrderId) || null;
  }, [orders, activeModalOrderId]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Sort sub-orders by size and then by GSM for the modal table display
  const sortedModalRows = useMemo(() => {
    if (!modalOrder || !modalOrder.rows) return [];
    return modalOrder.rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((a, b) => {
        const sizeA = a.row.size || '';
        const sizeB = b.row.size || '';
        // Ascending sort by size naturally (e.g. "9" before "10")
        const sizeCompare = sizeA.localeCompare(sizeB, undefined, { numeric: true, sensitivity: 'base' });
        if (sizeCompare !== 0) return sizeCompare;

        // Ascending sort by GSM
        const gsmA = a.row.gsm || 0;
        const gsmB = b.row.gsm || 0;
        return gsmA - gsmB;
      });
  }, [modalOrder]);

  // Load parent editing states when modal selection changes
  useEffect(() => {
    if (modalOrder) {
      setEditedOrderNo(modalOrder.orderNo);
      setEditedOrderDate(modalOrder.date);
      setEditedOrderStatus(modalOrder.status);
    } else {
      setIsEditingParentInfo(false);
    }
  }, [modalOrder]);

  // --- ACTIONS FOR PARENT ORDER ---

  // Create a brand new parent order ID
  const handleCreateParentOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only. Creating parent orders is locked.');
      return;
    }

    if (!newOrderNo.trim()) {
      triggerAlert('warn', 'Please specify a valid Order No / ID.');
      return;
    }

    // Check duplicate Order No to warn user
    const duplicate = orders.find(o => o.orderNo.trim().toLowerCase() === newOrderNo.trim().toLowerCase());
    if (duplicate) {
      triggerAlert('warn', `Order No "${newOrderNo}" already exists. Find it in the ledger and click "Manage" to configure.`);
      return;
    }

    setIsCreatingParent(true);
    const orderId = `L_ORD_${Date.now()}`;
    const payload: LoomOrder = {
      id: orderId,
      orderNo: newOrderNo.trim(),
      date: newOrderDate,
      status: newOrderStatus,
      rows: [],
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'loomOrders', orderId), payload);
      triggerAlert('success', `Created parent order ${newOrderNo.trim()} successfully.`);
      
      // Auto-open modal for the newly created parent order for easy sub-order entry
      setActiveModalOrderId(orderId);
      
      // Reset creation form
      setNewOrderNo('');
      const today = new Date();
      setNewOrderDate(today.toISOString().split('T')[0]);
      setNewOrderStatus('Pending');
    } catch (err: any) {
      console.error("Failed to create parent order", err);
      handleFirestoreError(err, OperationType.WRITE, `loomOrders/${orderId}`);
      triggerAlert('warn', 'Failed to save new order. Please check database permissions.');
    } finally {
      setIsCreatingParent(false);
    }
  };

  // Save changes to Parent order metadata
  const handleUpdateParentInfo = async () => {
    if (!modalOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }
    if (!editedOrderNo.trim()) {
      triggerAlert('warn', 'Order No cannot be empty.');
      return;
    }

    try {
      const orderRef = doc(db, 'loomOrders', modalOrder.id);
      await setDoc(orderRef, {
        ...modalOrder,
        orderNo: editedOrderNo.trim(),
        date: editedOrderDate,
        status: editedOrderStatus
      });
      triggerAlert('success', 'Parent order metadata updated successfully.');
      setIsEditingParentInfo(false);
    } catch (err) {
      console.error("Failed to update parent order metadata", err);
      triggerAlert('warn', 'Failed to update parent details.');
    }
  };

  // Quick Change Parent Order Status directly from the Modal header dropdown
  const handleParentStatusChange = async (newStatus: 'Pending' | 'Production' | 'Completed') => {
    if (!modalOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }
    try {
      const orderRef = doc(db, 'loomOrders', modalOrder.id);
      await setDoc(orderRef, {
        ...modalOrder,
        status: newStatus
      });
      triggerAlert('success', `Parent order status updated to ${newStatus}.`);
    } catch (err) {
      console.error("Failed to update parent status", err);
      triggerAlert('warn', 'Failed to update overall order status.');
    }
  };

  // Export current modal order data to Excel
  const handleExportOrderToExcel = () => {
    if (!modalOrder) return;

    try {
      // 1. Prepare Header info rows
      const headerRows = [
        ["PP FABRIC MANUFACTURING SPECIFICATIONS SHEET"],
        ["Order Reference:", modalOrder.orderNo, "", "Logged Date:", modalOrder.date, "", "Overall Status:", modalOrder.status],
        [], // empty spacer row
        ["#", "Weave Quality", "Lamination Type", "Size / Width", "GSM", "Denier", "Fabric Weight (g)", "Target (Tons)", "Completed (Tons)", "Status", "Remarks"]
      ];

      // 2. Prepare items rows
      const itemRows = sortedModalRows.map(({ row }, idx) => [
        idx + 1,
        row.quality || '',
        (row.laminationType || 'NON-LAMINATION').toUpperCase(),
        row.size || '',
        row.gsm || 0,
        row.denier || 0,
        row.fabricWeight || 0,
        row.totalQuantity || 0,
        row.productionCompleted || 0,
        row.status || 'Pending',
        row.remarks || ''
      ]);

      // Combine them
      const allRows = [...headerRows, ...itemRows];

      // Create sheet
      const worksheet = XLSX.utils.aoa_to_sheet(allRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Order_${modalOrder.orderNo}`);

      // Auto columns sizing
      worksheet['!cols'] = [
        { wch: 6 },  // #
        { wch: 25 }, // Quality
        { wch: 18 }, // Lamination Type
        { wch: 15 }, // Size
        { wch: 10 }, // GSM
        { wch: 10 }, // Denier
        { wch: 15 }, // Fabric weight
        { wch: 15 }, // Target Quantity
        { wch: 18 }, // Production Completed
        { wch: 12 }, // Status
        { wch: 30 }  // Remarks
      ];

      XLSX.writeFile(workbook, `PP_Fabric_Order_${modalOrder.orderNo}_Details.xlsx`);
      triggerAlert('success', `Exported Order "${modalOrder.orderNo}" details to Excel successfully.`);
    } catch (err) {
      console.error("Failed to export order to Excel", err);
      triggerAlert('warn', 'Failed to generate Excel export.');
    }
  };

  // Delete entire order record
  const handleDeleteOrder = async (id: string, code: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'loomOrders', id));
      triggerAlert('success', `Loom Order ${code} has been deleted.`);
      if (activeModalOrderId === id) {
        setActiveModalOrderId(null);
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete loom order", err);
      triggerAlert('warn', 'Unable to delete order. Permission denied.');
    }
  };

  // --- ACTIONS FOR SUB-ORDERS ---

  // Roll increment/decrement helpers
  const incrementSubRolls = () => {
    const current = parseInt(subNoOfRolls, 10);
    if (isNaN(current)) {
      setSubNoOfRolls('1');
    } else {
      setSubNoOfRolls(String(current + 1));
    }
  };

  const decrementSubRolls = () => {
    const current = parseInt(subNoOfRolls, 10);
    if (isNaN(current) || current <= 0) {
      setSubNoOfRolls('0');
    } else {
      setSubNoOfRolls(String(current - 1));
    }
  };

  const incrementInlineRolls = () => {
    const current = parseInt(inlineNoOfRolls, 10);
    if (isNaN(current)) {
      setInlineNoOfRolls('1');
    } else {
      setInlineNoOfRolls(String(current + 1));
    }
  };

  const decrementInlineRolls = () => {
    const current = parseInt(inlineNoOfRolls, 10);
    if (isNaN(current) || current <= 0) {
      setInlineNoOfRolls('0');
    } else {
      setInlineNoOfRolls(String(current - 1));
    }
  };

  // Add individual sub-order under the active Modal Order or Selected Order
  const handleAddSubOrder = async (e: React.FormEvent, targetOrder: LoomOrder | null) => {
    e.preventDefault();
    if (!targetOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }

    if (!subSize.trim() || !subQuality.trim()) {
      triggerAlert('warn', 'Size and Quality specifications are required.');
      return;
    }

    const gsmVal = parseFloat(subGsm);
    const denierVal = parseFloat(subDenier);
    const fabricWeightVal = parseFloat(subFabricWeight);
    const totalQtyVal = parseFloat(subTotalQuantity);

    if (isNaN(gsmVal) || gsmVal <= 0 || isNaN(denierVal) || denierVal <= 0 || isNaN(fabricWeightVal) || fabricWeightVal <= 0 || isNaN(totalQtyVal) || totalQtyVal <= 0) {
      triggerAlert('warn', 'GSM, Denier, Fabric Weight and Tonnage Target must be valid positive numbers.');
      return;
    }

    let rollsVal: number | undefined = undefined;
    if (subNoOfRolls.trim() !== '') {
      const parsed = parseInt(subNoOfRolls, 10);
      if (isNaN(parsed) || parsed < 0) {
        triggerAlert('warn', 'Number of rolls must be a positive integer.');
        return;
      }
      rollsVal = parsed;
    }

    const finalLaminationType = (
      subLaminationSelection === 'other' 
        ? subLaminationCustom.trim() 
        : subLaminationSelection
    ).toUpperCase();

    if (subLaminationSelection === 'other' && !subLaminationCustom.trim()) {
      triggerAlert('warn', 'Please specify the custom lamination type.');
      return;
    }

    const newSubOrder: LoomOrderRow = {
      size: subSize.trim(),
      quality: subQuality.trim(),
      gsm: gsmVal,
      denier: denierVal,
      fabricWeight: fabricWeightVal,
      totalQuantity: totalQtyVal,
      productionCompleted: 0,
      remarks: subRemarks.trim(),
      status: subItemStatus,
      noOfRolls: rollsVal,
      laminationType: finalLaminationType
    };

    const updatedRows = [...targetOrder.rows, newSubOrder];

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });

      triggerAlert('success', 'New sub-order specification logged successfully.');
      
      // Clear sub-order form fields
      setSubSize('');
      setSubQuality('');
      setSubGsm('');
      setSubDenier('');
      setSubFabricWeight('');
      setSubTotalQuantity('');
      setSubRemarks('');
      setSubItemStatus('Pending');
      setSubNoOfRolls('');
      setSubLaminationSelection('LAMINATION');
      setSubLaminationCustom('');
    } catch (err) {
      console.error("Failed to save sub-order", err);
      triggerAlert('warn', 'Failed to append sub-order item.');
    }
  };

  // Launch Inline Editing for a specific row index
  const handleStartInlineEdit = (index: number, row: LoomOrderRow) => {
    setEditingRowIndex(index);
    setInlineSize(row.size);
    setInlineQuality(row.quality);
    setInlineGsm(String(row.gsm));
    setInlineDenier(String(row.denier));
    setInlineFabricWeight(String(row.fabricWeight));
    setInlineTotalQuantity(String(row.totalQuantity));
    setInlineProductionCompleted(String(row.productionCompleted ?? 0));
    setInlineRemarks(row.remarks || '');
    setInlineRowStatus(row.status || 'Pending');
    setInlineNoOfRolls(row.noOfRolls !== undefined ? String(row.noOfRolls) : '');
    
    const normalizedLaminationType = (row.laminationType || 'NON-LAMINATION').toUpperCase();
    if (normalizedLaminationType === 'LAMINATION' || normalizedLaminationType === 'LAMINATED') {
      setInlineLaminationSelection('LAMINATION');
      setInlineLaminationCustom('');
    } else if (normalizedLaminationType === 'NON-LAMINATION' || normalizedLaminationType === 'NON-LAMINATED') {
      setInlineLaminationSelection('NON-LAMINATION');
      setInlineLaminationCustom('');
    } else if (row.laminationType) {
      setInlineLaminationSelection('other');
      setInlineLaminationCustom(row.laminationType.toUpperCase());
    } else {
      setInlineLaminationSelection('NON-LAMINATION');
      setInlineLaminationCustom('');
    }
  };

  // Save changes to single sub-order item
  const handleSaveInlineSubOrder = async (index: number, targetOrder: LoomOrder | null) => {
    if (!targetOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }

    if (!inlineSize.trim() || !inlineQuality.trim()) {
      triggerAlert('warn', 'Size and Quality cannot be empty.');
      return;
    }

    const gsmVal = parseFloat(inlineGsm);
    const denierVal = parseFloat(inlineDenier);
    const fabricWeightVal = parseFloat(inlineFabricWeight);
    const totalQtyVal = parseFloat(inlineTotalQuantity);
    const completedQtyVal = parseFloat(inlineProductionCompleted);

    if (isNaN(gsmVal) || gsmVal <= 0 || isNaN(denierVal) || denierVal <= 0 || isNaN(fabricWeightVal) || fabricWeightVal <= 0 || isNaN(totalQtyVal) || totalQtyVal <= 0) {
      triggerAlert('warn', 'GSM, Denier, Weight, and Target must be valid positive numbers.');
      return;
    }

    if (isNaN(completedQtyVal) || completedQtyVal < 0) {
      triggerAlert('warn', 'Production Completed must be a non-negative number.');
      return;
    }

    let rollsVal: number | undefined = undefined;
    if (inlineNoOfRolls.trim() !== '') {
      const parsed = parseInt(inlineNoOfRolls, 10);
      if (isNaN(parsed) || parsed < 0) {
        triggerAlert('warn', 'Number of rolls must be a positive integer.');
        return;
      }
      rollsVal = parsed;
    }

    const finalInlineLaminationType = (
      inlineLaminationSelection === 'other'
        ? inlineLaminationCustom.trim()
        : inlineLaminationSelection
    ).toUpperCase();

    if (inlineLaminationSelection === 'other' && !inlineLaminationCustom.trim()) {
      triggerAlert('warn', 'Please specify the custom lamination type.');
      return;
    }

    const updatedRows = [...targetOrder.rows];
    updatedRows[index] = {
      size: inlineSize.trim(),
      quality: inlineQuality.trim(),
      gsm: gsmVal,
      denier: denierVal,
      fabricWeight: fabricWeightVal,
      totalQuantity: totalQtyVal,
      productionCompleted: completedQtyVal,
      remarks: inlineRemarks.trim(),
      status: inlineRowStatus,
      noOfRolls: rollsVal,
      laminationType: finalInlineLaminationType
    };

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });

      triggerAlert('success', `Sub-order item #${index + 1} updated successfully.`);
      setEditingRowIndex(null);
    } catch (err) {
      console.error("Failed to update sub-order item", err);
      triggerAlert('warn', 'Failed to save sub-order changes.');
    }
  };

  // Delete a sub-order row individually
  const handleDeleteSubOrder = async (index: number, targetOrder: LoomOrder | null) => {
    if (!targetOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }

    const updatedRows = targetOrder.rows.filter((_, idx) => idx !== index);

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });

      triggerAlert('success', `Sub-order item has been removed.`);
      if (editingRowIndex === index) {
        setEditingRowIndex(null);
      }
    } catch (err) {
      console.error("Failed to delete sub-order item", err);
      triggerAlert('warn', 'Failed to remove sub-order.');
    }
  };

  // --- COMBINED FILTERING & SEARCH STATEMENTS (OPTION A LEDGER) ---
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Search Query matches Order No or Quality/Size inside sub-orders
      const text = searchQuery.toLowerCase();
      const orderNoMatch = order.orderNo.toLowerCase().includes(text);
      const specMatch = order.rows.some(row => 
        row.quality.toLowerCase().includes(text) ||
        row.size.toLowerCase().includes(text)
      );
      
      const searchMatch = !text || orderNoMatch || specMatch;

      // 2. Date match
      const dateMatch = !searchDate || order.date === searchDate;
      
      // 3. Status match
      const statusMatch = filterStatus === 'All' || order.status === filterStatus;

      return searchMatch && dateMatch && statusMatch;
    });
  }, [orders, searchQuery, searchDate, filterStatus]);

  // Aggregate stats across filtered orders
  const ledgerStats = useMemo(() => {
    let totalTarget = 0;
    let totalCompleted = 0;
    let subOrdersCount = 0;

    filteredOrders.forEach(o => {
      o.rows.forEach(r => {
        totalTarget += r.totalQuantity;
        totalCompleted += (r.productionCompleted || 0);
        subOrdersCount += 1;
      });
    });

    return {
      ordersCount: filteredOrders.length,
      subOrdersCount,
      totalTarget,
      totalCompleted
    };
  }, [filteredOrders]);

  // Aggregate stats for the currently opened Modal Order
  const modalStats = useMemo(() => {
    if (!modalOrder) return { totalTarget: 0, totalCompleted: 0, completionRate: 0, pendingCount: 0, prodCount: 0, compCount: 0, totalRollsReady: 0, totalRolls: 0 };
    
    let totalTarget = 0;
    let totalCompleted = 0;
    let pendingCount = 0;
    let prodCount = 0;
    let compCount = 0;
    let totalRollsReady = 0;
    let totalRolls = 0;

    modalOrder.rows.forEach(r => {
      totalTarget += r.totalQuantity;
      totalCompleted += (r.productionCompleted || 0);
      
      const rolls = r.noOfRolls || 0;
      totalRolls += rolls;

      const itemStatus = r.status || 'Pending';
      if (itemStatus === 'Pending') pendingCount++;
      else if (itemStatus === 'Production') prodCount++;
      else if (itemStatus === 'Completed') {
        compCount++;
        totalRollsReady += rolls;
      }
    });

    const completionRate = totalTarget > 0 ? (totalCompleted / totalTarget) * 100 : 0;

    return {
      totalTarget,
      totalCompleted,
      completionRate,
      pendingCount,
      prodCount,
      compCount,
      totalRollsReady,
      totalRolls
    };
  }, [modalOrder]);

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="loom-orders-plant-panel">
      
      {/* Page Title & Counters with Carbon & Amber Highlights */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-zinc-200 pb-5" id="loom-header">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2 uppercase">
            <span className="w-2.5 h-6 bg-amber-500 rounded-sm inline-block"></span>
            PP Fabric Orders
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Heavy-duty registry to organize factory weaving grids, allocate tonnage metrics, and manage custom fabric specifications.
          </p>
        </div>
        
        {/* Industrial Rapid Counters */}
        <div className="flex flex-wrap items-center gap-2 mt-1 md:mt-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2 flex items-center gap-3 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <div>
              <p className="text-[8px] font-black uppercase text-zinc-400 leading-none tracking-wider">Active Run Logs</p>
              <p className="text-xs font-black text-amber-400 mt-0.5 leading-none font-mono">
                {ledgerStats.ordersCount} Parent / {ledgerStats.subOrdersCount} Specs
              </p>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2 flex items-center gap-3 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <div>
              <p className="text-[8px] font-black uppercase text-zinc-400 leading-none tracking-wider">Ledger Tonnage</p>
              <p className="text-xs font-black text-orange-400 mt-0.5 leading-none font-mono">
                {ledgerStats.totalCompleted.toFixed(2)} / {ledgerStats.totalTarget.toFixed(2)} Tons
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="loom-main-content">
        
        {/* ================= LEFT COLUMN: CARBON BLACK ACTIVE ORDER CONSOLE ================= */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          
          <div className="bg-zinc-950 text-zinc-100 rounded-3xl border border-zinc-800 shadow-xl p-5 md:p-6" id="loom-create-parent-console">
            <div className="border-b border-zinc-800 pb-3.5 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-amber-500 rounded-xs"></span>
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-200">
                  Loom Order Controller
                </h3>
              </div>
              <span className="text-[9px] font-bold text-zinc-500 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-850">
                PROMPT
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-normal mb-5">
              Enter a primary Order ID or manufacturing code below. The system will index this key to catalog individual weave patterns, widths, and yardage specs.
            </p>

            {/* Quick Create Parent Order Form */}
            <form onSubmit={handleCreateParentOrder} className="space-y-4">
              <div>
                <label className="text-[8.5px] font-black uppercase text-zinc-400 tracking-wider block mb-1">
                  Order ID / No <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newOrderNo}
                    onChange={(e) => setNewOrderNo(e.target.value)}
                    placeholder="e.g. PP-LOOM-904"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-black text-amber-300 placeholder-zinc-600 focus:bg-zinc-850 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all font-mono"
                    required
                  />
                  <Layers size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[8.5px] font-black uppercase text-zinc-400 tracking-wider block mb-1">
                    Order Date <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={newOrderDate}
                    onChange={(e) => setNewOrderDate(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-2.5 text-xs font-bold text-zinc-350 focus:bg-zinc-850 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-[8.5px] font-black uppercase text-zinc-400 tracking-wider block mb-1">
                    Overall Status
                  </label>
                  <select
                    value={newOrderStatus}
                    onChange={(e) => setNewOrderStatus(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-2 text-xs font-extrabold text-zinc-300 focus:bg-zinc-850 focus:outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="Pending">🕒 Pending</option>
                    <option value="Production">⚙️ Production</option>
                    <option value="Completed">✅ Completed</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingParent}
                className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-zinc-950 rounded-xl py-2.5 font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-1.5 mt-2"
              >
                {isCreatingParent ? (
                  <>Initializing Order Registry...</>
                ) : (
                  <>
                    Initialize Order <PlusCircle size={14} className="stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Informational Guide */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 flex gap-3 text-zinc-600 shadow-3xs" id="loom-info-card">
            <Hammer size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-extrabold text-zinc-900 uppercase block mb-1">
                Loom Plant Protocol
              </span>
              Make sure to keep the specs updated. Turnaround targets and completion rates are dynamically aggregated from all individual sub-orders assigned to each active order.
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: STUNNING LEDGER SHEET VIEW (OPTION A) ================= */}
        <div className="lg:col-span-8 flex flex-col min-h-[500px]" id="loom-orders-schedule-ledger">
          
          {/* Advanced Controls Card */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-4 mb-4 shadow-3xs" id="loom-search-box">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">
              <SlidersHorizontal size={12} className="text-zinc-500" />
              <span>Refine Loom ledger search</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Query box */}
              <div className="sm:col-span-5 relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter by Order No, Size, or Quality..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl py-2 text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:outline-none transition-all"
                />
              </div>

              {/* Date selection */}
              <div className="sm:col-span-3">
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs font-semibold text-zinc-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Overall status filter */}
              <div className="sm:col-span-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-2 text-[11px] font-extrabold text-zinc-750 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Production">Production</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Reset trigger */}
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchDate('');
                  setFilterStatus('All');
                }}
                className="sm:col-span-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs rounded-xl py-2 text-center uppercase tracking-wider transition-all border border-zinc-250"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Payroll Ledger Style Grid layout (Option A) */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-md overflow-hidden flex-1 flex flex-col">
            {/* Desktop View Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950 text-zinc-200 border-b border-zinc-800">
                    <th className="py-3.5 px-4 text-[10.5px] font-black uppercase tracking-wider">Order No / ID</th>
                    <th className="py-3.5 px-3 text-[10.5px] font-black uppercase tracking-wider text-center w-[95px]">Total Specs</th>
                    <th className="py-3.5 px-3 text-[10.5px] font-black uppercase tracking-wider text-right whitespace-nowrap w-[125px]">Tonnage Target</th>
                    <th className="py-3.5 px-3 text-[10.5px] font-black uppercase tracking-wider w-[125px]">Completion Progress</th>
                    <th className="py-3.5 px-3 text-[10.5px] font-black uppercase tracking-wider text-center w-[85px]">Status</th>
                    <th className="py-3.5 px-4 text-[10.5px] font-black uppercase tracking-wider text-right w-[125px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-zinc-450 uppercase tracking-widest text-[10px] font-bold">
                        <Clock className="animate-spin text-amber-500 mx-auto mb-2.5" size={24} />
                        Syncing active loom ledger...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center select-none">
                        <FileSpreadsheet className="text-zinc-300 mx-auto mb-3" size={48} />
                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest font-mono">No Active Ledger Logs</p>
                        <p className="text-[10px] text-zinc-500 max-w-sm mx-auto mt-0.5">
                          Configure a new parent order code in the left console to get started.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      // Summing up suborders
                      const totalTarget = order.rows.reduce((sum, r) => sum + r.totalQuantity, 0);
                      const totalCompleted = order.rows.reduce((sum, r) => sum + (r.productionCompleted || 0), 0);
                      const completionPercent = totalTarget > 0 ? Math.min(100, (totalCompleted / totalTarget) * 100) : 0;

                      // Extract unique qualities
                      const uniqueQualities = Array.from(new Set(order.rows.map(r => r.quality))).filter(Boolean);
                      const qualitiesStr = uniqueQualities.length > 0 ? uniqueQualities.join(', ') : 'No sub-orders logged yet';

                      // Status Badge Classes
                      const statusStyles = {
                        Pending: 'bg-amber-50 text-amber-800 border border-amber-250 font-bold',
                        Production: 'bg-orange-50 text-orange-800 border border-orange-250 font-extrabold ring-1 ring-orange-500/20 animate-pulse',
                        Completed: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold'
                      };

                      // Format display date neatly (e.g. "23 Jun 2026")
                      let displayDate = order.date;
                      try {
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        const [yr, mo, dy] = order.date.split('-');
                        if (yr && mo && dy) {
                          displayDate = `${dy} ${months[parseInt(mo, 10) - 1]} ${yr}`;
                        }
                      } catch (e) {}

                      return (
                        <tr 
                          key={order.id} 
                          className="hover:bg-zinc-50/75 transition-colors group align-middle"
                        >
                          {/* Parent Code Badge & Date in wide formatted column */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-col items-start">
                              <span className="inline-block bg-zinc-900 border border-zinc-800 text-amber-400 text-xs md:text-[13px] font-black font-mono px-3 py-1.5 rounded-lg shadow-3xs uppercase tracking-wide">
                                {order.orderNo}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] md:text-[11.5px] text-zinc-500 font-bold">
                                <CalendarIcon size={11} className="text-zinc-400 shrink-0" />
                                <span>{displayDate}</span>
                              </div>
                            </div>
                          </td>

                          {/* Total specs logged */}
                          <td className="py-3.5 px-3 text-center">
                            <span className="inline-flex items-center justify-center bg-amber-50 text-amber-900 border border-amber-200 text-xs md:text-[13px] font-black font-mono rounded-lg px-3.5 py-1.5 min-w-[38px]" title={qualitiesStr}>
                              {order.rows.length}
                            </span>
                          </td>

                          {/* Summed Completed out of Aggregate target volume */}
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <span className="text-[12.5px] md:text-[14px] font-black text-zinc-900 font-mono block whitespace-nowrap">
                              {totalCompleted.toFixed(2)} / {totalTarget.toFixed(2)}
                            </span>
                            <span className="text-[9.5px] text-zinc-400 block font-sans font-black uppercase tracking-wider whitespace-nowrap mt-0.5">
                              Tons Logged
                            </span>
                          </td>

                          {/* Progress bar visual indicator */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] md:text-[12.5px] font-black text-zinc-700 font-mono min-w-[32px]">
                                {completionPercent.toFixed(0)}%
                              </span>
                              <div className="w-12 sm:w-16 bg-zinc-150 rounded-full h-1.5 overflow-hidden border border-zinc-200 shrink-0">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    completionPercent >= 100 ? 'bg-emerald-500' :
                                    completionPercent >= 50 ? 'bg-orange-500' :
                                    completionPercent > 0 ? 'bg-amber-500' : 'bg-zinc-300'
                                  }`}
                                  style={{ width: `${completionPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <span className={`inline-block text-[9.5px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full ${statusStyles[order.status] || 'bg-zinc-100'}`}>
                              {order.status}
                            </span>
                          </td>

                          {/* Action Button trigger the popup modal */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setActiveModalOrderId(order.id);
                                  setEditingRowIndex(null);
                                }}
                                className="bg-zinc-900 hover:bg-zinc-850 text-amber-400 hover:text-amber-300 border border-zinc-800 text-[10.5px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl transition-all flex items-center gap-1 shadow-3xs"
                                title="Open Sub-Orders Management Ledger Modal"
                              >
                                Manage <ExternalLink size={11} className="stroke-[2.5]" />
                              </button>

                              {deleteConfirmId === order.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl p-0.5 animate-fadeIn">
                                  <button
                                    onClick={() => handleDeleteOrder(order.id, order.orderNo)}
                                    className="bg-rose-500 hover:bg-rose-600 text-white font-black text-[9px] px-2.5 py-1 rounded-lg uppercase tracking-wider transition-colors"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="text-zinc-500 hover:text-zinc-700 p-0.5"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(order.id)}
                                  className="bg-zinc-50 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 p-2 rounded-xl border border-zinc-200 hover:border-rose-150 transition-colors"
                                  title="Delete entire order"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View Card List */}
            <div className="block md:hidden divide-y divide-zinc-200">
              {loading ? (
                <div className="py-12 text-center text-zinc-450 uppercase tracking-widest text-[10px] font-bold">
                  <Clock className="animate-spin text-amber-500 mx-auto mb-2.5" size={24} />
                  Syncing active loom ledger...
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-16 text-center select-none px-4">
                  <FileSpreadsheet className="text-zinc-300 mx-auto mb-3" size={40} />
                  <p className="text-xs font-black text-zinc-400 uppercase tracking-widest font-mono">No Active Ledger Logs</p>
                  <p className="text-[10px] text-zinc-500 max-w-sm mx-auto mt-0.5">
                    Configure a new parent order code in the left console to get started.
                  </p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const totalTarget = order.rows.reduce((sum, r) => sum + r.totalQuantity, 0);
                  const totalCompleted = order.rows.reduce((sum, r) => sum + (r.productionCompleted || 0), 0);
                  const completionPercent = totalTarget > 0 ? Math.min(100, (totalCompleted / totalTarget) * 100) : 0;

                  const statusStyles = {
                    Pending: 'bg-amber-50 text-amber-800 border border-amber-250 font-bold',
                    Production: 'bg-orange-50 text-orange-800 border border-orange-250 font-extrabold ring-1 ring-orange-500/20 animate-pulse',
                    Completed: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold'
                  };

                  let displayDate = order.date;
                  try {
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    const [yr, mo, dy] = order.date.split('-');
                    if (yr && mo && dy) {
                      displayDate = `${dy} ${months[parseInt(mo, 10) - 1]} ${yr}`;
                    }
                  } catch (e) {}

                  return (
                    <div key={order.id} className="p-4 flex flex-col gap-3 hover:bg-zinc-50/50 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col">
                          <span className="inline-block bg-zinc-900 border border-zinc-800 text-amber-400 text-xs font-black font-mono px-2.5 py-1 rounded-lg uppercase tracking-wide w-fit">
                            {order.orderNo}
                          </span>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-500 font-bold">
                            <CalendarIcon size={10} className="text-zinc-400" />
                            <span>{displayDate}</span>
                          </div>
                        </div>
                        <span className={`inline-block text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full ${statusStyles[order.status] || 'bg-zinc-100'}`}>
                          {order.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-zinc-50 border border-zinc-150 rounded-xl p-2 text-xs">
                        <div>
                          <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Total Specs</p>
                          <p className="font-bold text-zinc-800 font-mono mt-0.5">{order.rows.length} items</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Tonnage Target</p>
                          <p className="font-bold text-zinc-800 font-mono mt-0.5">{totalCompleted.toFixed(2)} / {totalTarget.toFixed(2)} Tons</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 mt-1">
                        {/* Progress Bar */}
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-[10px] font-black text-zinc-700 font-mono">
                            {completionPercent.toFixed(0)}%
                          </span>
                          <div className="flex-1 bg-zinc-150 rounded-full h-1.5 overflow-hidden border border-zinc-200">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                completionPercent >= 100 ? 'bg-emerald-500' :
                                completionPercent >= 50 ? 'bg-orange-500' :
                                completionPercent > 0 ? 'bg-amber-500' : 'bg-zinc-300'
                              }`}
                              style={{ width: `${completionPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setActiveModalOrderId(order.id);
                              setEditingRowIndex(null);
                            }}
                            className="bg-zinc-900 hover:bg-zinc-850 text-amber-400 border border-zinc-800 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all flex items-center gap-1"
                          >
                            Manage <ExternalLink size={10} className="stroke-[2.5]" />
                          </button>

                          {deleteConfirmId === order.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg p-0.5 animate-fadeIn">
                              <button
                                onClick={() => handleDeleteOrder(order.id, order.orderNo)}
                                className="bg-rose-500 text-white font-black text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider"
                              >
                                Del
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-zinc-500 p-0.5"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(order.id)}
                              className="bg-zinc-50 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 p-1.5 rounded-lg border border-zinc-200 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* ========================================================================================= */}
      {/* ======================== STUNNING SUB-ORDER DETAILS INTERACTIVE MODAL ==================== */}
      {/* ========================================================================================= */}
      {activeModalOrderId && modalOrder && (
        <div 
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in"
          id="loom-order-manager-overlay-modal"
          onClick={() => {
            setActiveModalOrderId(null);
            setEditingRowIndex(null);
            setDeleteConfirmSubIdx(null);
          }}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-[1380px] max-h-[90vh] overflow-hidden flex flex-col animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header: Premium Carbon Theme with Amber/Gold Highlights */}
            <div className="bg-zinc-950 text-zinc-100 p-5 md:px-6 md:py-5 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[8px] font-black bg-zinc-900 text-amber-400 border border-zinc-850 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    SPECIFICATION LEDGER CONSOLE
                  </span>
                  <span className="text-[9.5px] text-zinc-400 font-mono bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-855" title="Unique database safety timestamp key to prevent order record collisions">
                    System Db Key: {modalOrder.id.replace('L_ORD_', '')}
                  </span>
                </div>
                
                <h3 className="text-lg font-black text-white font-mono tracking-tight mt-1 flex items-center gap-2">
                  <Layers size={18} className="text-amber-500" />
                  Order Ref: <span className="text-amber-300">{modalOrder.orderNo}</span>
                </h3>
                
                {isEditingParentInfo ? (
                  <div className="flex items-center gap-2 mt-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl animate-fadeIn">
                    <input 
                      type="text" 
                      value={editedOrderNo}
                      onChange={(e) => setEditedOrderNo(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-amber-300 font-mono focus:outline-none"
                    />
                    <input 
                      type="date" 
                      value={editedOrderDate}
                      onChange={(e) => setEditedOrderDate(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                    />
                    <button 
                      onClick={handleUpdateParentInfo}
                      className="bg-amber-500 hover:bg-amber-600 text-zinc-950 text-[10px] font-black px-2.5 py-1 rounded"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsEditingParentInfo(false)}
                      className="text-zinc-400 hover:text-zinc-200 text-xs px-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 font-medium">
                    <CalendarIcon size={12} className="text-zinc-500" />
                    <span>Logged Date: <strong className="text-zinc-200 font-mono">{modalOrder.date}</strong></span>
                    <button
                      onClick={() => setIsEditingParentInfo(true)}
                      className="text-amber-500 hover:text-amber-400 text-[10px] font-bold hover:underline ml-2"
                    >
                      (Edit details)
                    </button>
                  </div>
                )}
              </div>

              {/* Header Right: Status Manager & Dismiss */}
              <div className="flex flex-wrap items-center gap-3 self-stretch md:self-auto justify-between md:justify-end border-t border-zinc-850 pt-3.5 md:pt-0 md:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Overall Status:
                  </span>
                  <select
                    value={modalOrder.status}
                    onChange={(e) => handleParentStatusChange(e.target.value as any)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-black text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="Pending">🕒 Pending</option>
                    <option value="Production">⚙️ Production</option>
                    <option value="Completed">✅ Completed</option>
                  </select>
                </div>

                <button
                  onClick={handleExportOrderToExcel}
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Export Order to Excel Sheet"
                >
                  <FileSpreadsheet size={14} className="text-white" />
                  <span>Export to Excel</span>
                </button>

                <button
                  onClick={() => {
                    setActiveModalOrderId(null);
                    setEditingRowIndex(null);
                    setDeleteConfirmSubIdx(null);
                  }}
                  className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-all flex items-center justify-center cursor-pointer"
                  title="Close Registry Modal"
                >
                  <X size={16} className="stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Modal Body: Metrics cards at the top & Spreadsheet Table below */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* STUNNING INDUSTRIAL METRICS ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Metric 1: Turnaround target */}
                <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl flex items-start justify-between shadow-3xs col-span-1">
                  <div>
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Turnaround Target
                    </span>
                    <span className="text-lg font-black text-zinc-900 font-mono block mt-1.5">
                      {modalStats.totalTarget.toFixed(2)} Tons
                    </span>
                    <span className="text-[10px] text-zinc-500 font-bold mt-0.5 block">
                      Target manufacturing volume
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-amber-400 border border-zinc-800">
                    <BarChart4 size={16} />
                  </div>
                </div>

                {/* Metric 2: Completed Fabric */}
                <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl flex items-start justify-between shadow-3xs col-span-1">
                  <div>
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Completed Fabric
                    </span>
                    <span className="text-lg font-black text-emerald-600 font-mono block mt-1.5">
                      {modalStats.totalCompleted.toFixed(2)} Tons
                    </span>
                    <span className="text-[10px] text-zinc-500 font-semibold block mt-0.5">
                      {modalStats.completionRate.toFixed(1)}% completed
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950">
                    <CheckCircle size={16} className="stroke-[2.5]" />
                  </div>
                </div>

                {/* Metric 3: Total Rolls Ready */}
                <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl flex items-start justify-between shadow-3xs col-span-1">
                  <div>
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Total Rolls Ready
                    </span>
                    <span className="text-lg font-black text-blue-600 font-mono block mt-1.5">
                      {modalStats.totalRolls} Rolls
                    </span>
                    <span className="text-[10px] text-zinc-500 font-semibold block mt-0.5">
                      Fully manufactured & prepared
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-blue-400 border border-zinc-800">
                    <Layers size={16} />
                  </div>
                </div>

                {/* Metric 4: Item Status Breakdown */}
                <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl col-span-1 sm:col-span-2 shadow-3xs">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none mb-2.5">
                    Sub-order Status Breakdown
                  </span>
                  
                  <div className="grid grid-cols-3 gap-2 text-center mt-1">
                    <div className="bg-white border border-zinc-200/80 rounded-xl p-2">
                      <p className="text-[8px] font-extrabold text-zinc-400 uppercase leading-none">Pending</p>
                      <p className="text-sm font-black text-amber-600 font-mono mt-1">{modalStats.pendingCount}</p>
                    </div>
                    <div className="bg-white border border-zinc-200/80 rounded-xl p-2">
                      <p className="text-[8px] font-extrabold text-zinc-400 uppercase leading-none">In Production</p>
                      <p className="text-sm font-black text-orange-600 font-mono mt-1">{modalStats.prodCount}</p>
                    </div>
                    <div className="bg-white border border-zinc-200/80 rounded-xl p-2">
                      <p className="text-[8px] font-extrabold text-zinc-400 uppercase leading-none">Completed</p>
                      <p className="text-sm font-black text-emerald-600 font-mono mt-1">{modalStats.compCount}</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* SUB-ORDERS LEDGER SPREADSHEET TABLE */}
              <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
                <div className="bg-zinc-100 px-4 py-2.5 border-b border-zinc-200 flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-zinc-800 tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet size={13} className="text-amber-600" /> Active Specifications Ledger ({modalOrder.rows.length})
                  </h4>
                  <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase">
                    All sub-order metrics fully editable
                  </span>
                </div>

                {modalOrder.rows.length === 0 ? (
                  <div className="py-12 text-center select-none">
                    <FileText className="mx-auto text-zinc-300 mb-2" size={32} />
                    <p className="text-xs font-black uppercase text-zinc-400 tracking-wider">No sub-order entries</p>
                    <p className="text-[10px] text-zinc-500 max-w-sm mx-auto mt-0.5">
                      Log specification requirements using the entry form below to populate the loom spreadsheet.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-zinc-50/80 text-zinc-500 border-b border-zinc-200">
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[40px]">#</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[140px]">Weave Quality</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[130px]">Lamination Type</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[100px]">Size</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[70px]">GSM</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[75px]">Denier</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[85px]">Fabric Wt (g)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[125px]">No. of Rolls</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right w-[95px]">Target (Tons)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right w-[110px]">Completed (Tons)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[100px]">Status</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[150px]">Remarks</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right min-w-[110px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {sortedModalRows.map(({ row, originalIndex }, displayIdx) => {
                            const isRowEditing = editingRowIndex === originalIndex;

                            if (isRowEditing) {
                              return (
                                /* DETAILED SPREADSHEET ROW IN EDIT MODE */
                                <tr key={originalIndex} className="bg-amber-50/20">
                                  <td className="py-2 px-1 text-center font-mono text-xs font-bold text-zinc-400">
                                    {displayIdx + 1}
                                  </td>
                                  
                                  {/* Quality Input */}
                                  <td className="py-2 px-1.5">
                                    <input
                                      type="text"
                                      value={inlineQuality}
                                      onChange={(e) => setInlineQuality(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs font-extrabold text-zinc-800"
                                    />
                                  </td>

                                  {/* Lamination Input */}
                                  <td className="py-2 px-1.5">
                                    <select
                                      value={inlineLaminationSelection}
                                      onChange={(e) => setInlineLaminationSelection(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-700 cursor-pointer"
                                    >
                                      <option value="LAMINATION">LAMINATION</option>
                                      <option value="NON-LAMINATION">NON-LAMINATION</option>
                                      <option value="other">OTHER (CUSTOM...)</option>
                                    </select>
                                    {inlineLaminationSelection === 'other' && (
                                      <input
                                        type="text"
                                        value={inlineLaminationCustom}
                                        onChange={(e) => setInlineLaminationCustom(e.target.value.toUpperCase())}
                                        placeholder="SPECIFY CUSTOM..."
                                        className="w-full mt-1 bg-white border border-zinc-300 rounded-lg px-2 py-0.5 text-xs text-zinc-800 uppercase"
                                        required
                                      />
                                    )}
                                  </td>

                                  {/* Size Input */}
                                  <td className="py-2 px-1.5">
                                    <input
                                      type="text"
                                      value={inlineSize}
                                      onChange={(e) => setInlineSize(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-700"
                                    />
                                  </td>

                                  {/* GSM Input */}
                                  <td className="py-2 px-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={inlineGsm}
                                      onChange={(e) => setInlineGsm(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-1.5 py-1 text-xs text-center font-mono font-bold"
                                    />
                                  </td>

                                  {/* Denier Input */}
                                  <td className="py-2 px-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={inlineDenier}
                                      onChange={(e) => setInlineDenier(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-1.5 py-1 text-xs text-center font-mono font-bold"
                                    />
                                  </td>

                                  {/* Weight Input */}
                                  <td className="py-2 px-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={inlineFabricWeight}
                                      onChange={(e) => setInlineFabricWeight(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-1.5 py-1 text-xs text-center font-mono font-bold"
                                    />
                                  </td>

                                  {/* Rolls Input with Plus/Minus buttons */}
                                  <td className="py-2 px-1">
                                    <div className="flex items-center gap-1 justify-center min-w-[120px]">
                                      <button
                                        type="button"
                                        onClick={decrementInlineRolls}
                                        className="h-7 w-7 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-300 flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        value={inlineNoOfRolls}
                                        onChange={(e) => setInlineNoOfRolls(e.target.value)}
                                        placeholder="Rolls"
                                        className="w-12 bg-white border border-zinc-300 rounded-lg px-1 py-1 text-xs text-center font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={incrementInlineRolls}
                                        className="h-7 w-7 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-300 flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>

                                  {/* Target Tonnage */}
                                  <td className="py-2 px-1.5">
                                    <input
                                      type="number"
                                      step="any"
                                      value={inlineTotalQuantity}
                                      onChange={(e) => setInlineTotalQuantity(e.target.value)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs text-right font-mono font-black"
                                    />
                                  </td>

                                  {/* Completed Tonnage */}
                                  <td className="py-2 px-1.5">
                                    <input
                                      type="number"
                                      step="any"
                                      value={inlineProductionCompleted}
                                      onChange={(e) => setInlineProductionCompleted(e.target.value)}
                                      className="w-full bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-1 text-xs text-right text-emerald-800 font-mono font-black"
                                    />
                                  </td>

                                  {/* Status Select */}
                                  <td className="py-2 px-1">
                                    <select
                                      value={inlineRowStatus}
                                      onChange={(e) => setInlineRowStatus(e.target.value as any)}
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-1 py-1 text-[11px] font-bold text-zinc-700 cursor-pointer"
                                    >
                                      <option value="Pending">Pending</option>
                                      <option value="Production">Production</option>
                                      <option value="Completed">Completed</option>
                                    </select>
                                  </td>

                                  {/* Remarks Input */}
                                  <td className="py-2 px-1.5">
                                    <input
                                      type="text"
                                      value={inlineRemarks}
                                      onChange={(e) => setInlineRemarks(e.target.value)}
                                      placeholder="Roll instructions..."
                                      className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs text-zinc-700"
                                    />
                                  </td>

                                  {/* Inline Actions */}
                                  <td className="py-2 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => handleSaveInlineSubOrder(originalIndex, modalOrder)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5"
                                      >
                                        <Check size={11} className="stroke-[2.5]" /> Save
                                      </button>
                                      <button
                                        onClick={() => setEditingRowIndex(null)}
                                        className="bg-zinc-200 hover:bg-zinc-350 text-zinc-600 px-2 py-1 rounded-md text-[10px] font-bold"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            // STATIC SPREADSHEET ROW
                            return (
                              <tr key={originalIndex} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="py-3 px-3 text-center font-mono text-xs font-bold text-zinc-400 border-r border-zinc-100">
                                  {displayIdx + 1}
                                </td>
                                
                                <td className="py-3 px-3 font-black text-zinc-900 text-xs uppercase">
                                  {row.quality}
                                </td>

                                <td className="py-3 px-3 font-semibold text-zinc-700 text-xs">
                                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                    (row.laminationType || 'NON-LAMINATION').toUpperCase() === 'LAMINATION' || (row.laminationType || 'NON-LAMINATION').toUpperCase() === 'LAMINATED'
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                                      : (row.laminationType || 'NON-LAMINATION').toUpperCase() === 'NON-LAMINATION' || (row.laminationType || 'NON-LAMINATION').toUpperCase() === 'NON-LAMINATED'
                                        ? 'bg-zinc-100 text-zinc-850 border border-zinc-200' 
                                        : 'bg-sky-50 text-sky-800 border border-sky-200'
                                  }`}>
                                    {(row.laminationType || 'NON-LAMINATION').toUpperCase()}
                                  </span>
                                </td>

                                <td className="py-3 px-3 font-semibold text-zinc-700 text-xs">
                                  {row.size}
                                </td>

                                <td className="py-3 px-3 text-center font-mono text-xs font-bold text-zinc-800">
                                  {row.gsm}
                                </td>

                                <td className="py-3 px-3 text-center font-mono text-xs font-bold text-zinc-800">
                                  {row.denier}
                                </td>

                                <td className="py-3 px-3 text-center font-mono text-xs font-bold text-zinc-800">
                                  {row.fabricWeight}g
                                </td>

                                <td className="py-3 px-3 text-center font-mono text-xs font-bold text-zinc-800">
                                  {row.noOfRolls !== undefined ? `${row.noOfRolls} rolls` : '—'}
                                </td>

                                <td className="py-3 px-3 text-right font-mono text-xs font-black text-zinc-900">
                                  {row.totalQuantity.toFixed(2)}T
                                </td>

                                <td className="py-3 px-3 text-right font-mono text-xs font-black text-emerald-600 bg-emerald-50/20">
                                  {(row.productionCompleted || 0).toFixed(2)}T
                                </td>

                                <td className="py-3 px-3 text-center">
                                  <span className={`inline-block text-[8px] uppercase tracking-wide px-2 py-0.5 border rounded-full font-black ${
                                    row.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    row.status === 'Production' ? 'bg-orange-50 text-orange-800 border-orange-250 animate-pulse' :
                                    'bg-zinc-100 text-zinc-600 border-zinc-250'
                                  }`}>
                                    {row.status || 'Pending'}
                                  </span>
                                </td>

                                <td className="py-3 px-3 text-zinc-500 text-[11px] leading-relaxed italic max-w-[200px] truncate" title={row.remarks}>
                                  {row.remarks || '—'}
                                </td>

                                <td className="py-3 px-3 text-right">
                                  {deleteConfirmSubIdx === originalIndex ? (
                                    <div className="flex items-center justify-end gap-1.5 animate-fade-in">
                                      <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider mr-1">
                                        Delete?
                                      </span>
                                      <button
                                        onClick={() => {
                                          handleDeleteSubOrder(originalIndex, modalOrder);
                                          setDeleteConfirmSubIdx(null);
                                        }}
                                        className="px-2 py-1 text-[10px] font-black bg-rose-600 hover:bg-rose-700 text-white rounded-md uppercase tracking-wider transition-all shadow-xs flex items-center gap-0.5"
                                        title="Yes, delete this row"
                                      >
                                        ✅ Yes
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmSubIdx(null)}
                                        className="px-2 py-1 text-[10px] font-black bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded-md uppercase tracking-wider transition-all flex items-center gap-0.5"
                                        title="No, cancel deletion"
                                      >
                                        ❌ No
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-3">
                                      <button
                                        onClick={() => {
                                          setDeleteConfirmSubIdx(null);
                                          handleStartInlineEdit(originalIndex, row);
                                        }}
                                        className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100/50 hover:text-amber-700 hover:border-amber-300 transition-colors shadow-2xs flex items-center gap-1 font-bold text-xs"
                                        title="Edit Specification Row"
                                      >
                                        <span className="text-sm">✏️</span>
                                        <Edit size={14} className="stroke-[2.5]" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingRowIndex(null);
                                          setDeleteConfirmSubIdx(originalIndex);
                                        }}
                                        className="p-1.5 rounded bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-100/50 hover:text-rose-600 hover:border-rose-300 transition-colors shadow-2xs flex items-center gap-1 font-bold text-xs"
                                        title="Delete Specification Row"
                                      >
                                        <span className="text-sm">🗑️</span>
                                        <Trash2 size={14} className="stroke-[2.5]" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View Card List */}
                    <div className="block md:hidden divide-y divide-zinc-200">
                      {sortedModalRows.map(({ row, originalIndex }, displayIdx) => {
                        const isRowEditing = editingRowIndex === originalIndex;

                        if (isRowEditing) {
                          return (
                            <div key={originalIndex} className="p-4 bg-amber-50/20 space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-amber-600 uppercase font-mono">
                                  Editing Entry #{displayIdx + 1}
                                </span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => handleSaveInlineSubOrder(originalIndex, modalOrder)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                  >
                                    <Check size={11} className="stroke-[2.5]" /> Save
                                  </button>
                                  <button
                                    onClick={() => setEditingRowIndex(null)}
                                    className="bg-zinc-200 hover:bg-zinc-300 text-zinc-600 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Quality</label>
                                  <input
                                    type="text"
                                    value={inlineQuality}
                                    onChange={(e) => setInlineQuality(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Lamination Type</label>
                                  <select
                                    value={inlineLaminationSelection}
                                    onChange={(e) => setInlineLaminationSelection(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                  >
                                    <option value="LAMINATION">LAMINATION</option>
                                    <option value="NON-LAMINATION">NON-LAMINATION</option>
                                    <option value="other">OTHER (CUSTOM...)</option>
                                  </select>
                                  {inlineLaminationSelection === 'other' && (
                                    <input
                                      type="text"
                                      value={inlineLaminationCustom}
                                      onChange={(e) => setInlineLaminationCustom(e.target.value.toUpperCase())}
                                      placeholder="SPECIFY CUSTOM..."
                                      className="w-full mt-1 bg-white border border-zinc-350 rounded-lg px-2.5 py-1 text-xs uppercase"
                                      required
                                    />
                                  )}
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Size</label>
                                  <input
                                    type="text"
                                    value={inlineSize}
                                    onChange={(e) => setInlineSize(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">GSM</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineGsm}
                                    onChange={(e) => setInlineGsm(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-center"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Denier</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineDenier}
                                    onChange={(e) => setInlineDenier(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-center"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Fabric Wt (g)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineFabricWeight}
                                    onChange={(e) => setInlineFabricWeight(e.target.value)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-center"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">No. of Rolls</label>
                                  <div className="flex items-center gap-1 justify-center">
                                    <button
                                      type="button"
                                      onClick={decrementInlineRolls}
                                      className="h-7 w-7 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-300 flex items-center justify-center font-bold text-xs"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      value={inlineNoOfRolls}
                                      onChange={(e) => setInlineNoOfRolls(e.target.value)}
                                      className="w-12 bg-white border border-zinc-350 rounded-lg py-1 text-xs text-center font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={incrementInlineRolls}
                                      className="h-7 w-7 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded border border-zinc-300 flex items-center justify-center font-bold text-xs"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Target (Tons)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineTotalQuantity}
                                    onChange={(e) => setInlineTotalQuantity(e.target.value)}
                                    className="w-full bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black text-right"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Completed (Tons)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineProductionCompleted}
                                    onChange={(e) => setInlineProductionCompleted(e.target.value)}
                                    className="w-full bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs text-emerald-800 font-mono font-black text-right"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Status</label>
                                  <select
                                    value={inlineRowStatus}
                                    onChange={(e) => setInlineRowStatus(e.target.value as any)}
                                    className="w-full bg-white border border-zinc-350 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                  >
                                    <option value="Pending">Pending</option>
                                    <option value="Production">Production</option>
                                    <option value="Completed">Completed</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Remarks</label>
                                  <input
                                    type="text"
                                    value={inlineRemarks}
                                    onChange={(e) => setInlineRemarks(e.target.value)}
                                    className="w-full bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={originalIndex} className="p-4 space-y-3 hover:bg-zinc-50/50 transition-colors">
                            <div className="flex justify-between items-center">
                              <span className="font-mono text-xs font-bold text-zinc-400">
                                Entry #{displayIdx + 1}
                              </span>
                              <span className={`inline-block text-[8px] uppercase tracking-wide px-2 py-0.5 border rounded-full font-black ${
                                row.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                row.status === 'Production' ? 'bg-orange-50 text-orange-800 border-orange-250 animate-pulse' :
                                'bg-zinc-100 text-zinc-600 border-zinc-250'
                              }`}>
                                {row.status || 'Pending'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider block">Quality</span>
                                <span className="font-bold text-zinc-900 uppercase block mt-0.5">{row.quality}</span>
                              </div>
                              <div>
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider block">Lamination</span>
                                <span className="font-semibold text-zinc-700 block mt-0.5 uppercase">{(row.laminationType || 'NON-LAMINATION').toUpperCase()}</span>
                              </div>
                              <div>
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider block">Size / Width</span>
                                <span className="font-semibold text-zinc-700 block mt-0.5">{row.size}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-1 bg-zinc-50 border border-zinc-200/60 rounded-xl p-2 text-center text-[11px]">
                              <div>
                                <span className="text-[7.5px] font-bold text-zinc-400 uppercase block">GSM</span>
                                <span className="font-bold text-zinc-800 font-mono">{row.gsm}</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-bold text-zinc-400 uppercase block">Denier</span>
                                <span className="font-bold text-zinc-800 font-mono">{row.denier}</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-bold text-zinc-400 uppercase block">Wt (g)</span>
                                <span className="font-bold text-zinc-800 font-mono">{row.fabricWeight}g</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-bold text-zinc-400 uppercase block">Rolls</span>
                                <span className="font-bold text-zinc-800 font-mono">{row.noOfRolls || '—'}</span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center gap-2 bg-emerald-50/20 border border-emerald-500/10 rounded-xl p-2 text-xs font-mono">
                              <div>
                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-wider block">Target</span>
                                <span className="font-black text-zinc-900">{row.totalQuantity.toFixed(2)}T</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-wider block">Completed</span>
                                <span className="font-black text-emerald-600">{(row.productionCompleted || 0).toFixed(2)}T</span>
                              </div>
                            </div>

                            {row.remarks && (
                              <div className="text-[10px] text-zinc-500 italic bg-zinc-50 px-2 py-1.5 rounded-lg border border-zinc-200/50">
                                <span className="font-bold text-[8px] uppercase tracking-wide text-zinc-400 block not-italic">Remarks:</span>
                                {row.remarks}
                              </div>
                            )}

                            <div className="flex justify-end pt-1 border-t border-zinc-150">
                              {deleteConfirmSubIdx === originalIndex ? (
                                <div className="flex items-center gap-1.5 animate-fade-in">
                                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider mr-1">
                                    Delete?
                                  </span>
                                  <button
                                    onClick={() => {
                                      handleDeleteSubOrder(originalIndex, modalOrder);
                                      setDeleteConfirmSubIdx(null);
                                    }}
                                    className="px-2.5 py-1 text-[10px] font-black bg-rose-600 text-white rounded-lg uppercase tracking-wider transition-all"
                                  >
                                    Yes, Delete
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmSubIdx(null)}
                                    className="px-2.5 py-1 text-[10px] font-black bg-zinc-200 text-zinc-800 rounded-lg uppercase"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmSubIdx(null);
                                      handleStartInlineEdit(originalIndex, row);
                                    }}
                                    className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100/50 hover:text-amber-700 transition-colors flex items-center gap-1 font-bold text-[11px]"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingRowIndex(null);
                                      setDeleteConfirmSubIdx(originalIndex);
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-100/50 hover:text-rose-600 transition-colors flex items-center gap-1 font-bold text-[11px]"
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* MODAL IN-PLACE FORM: ADD NEW SPECIFICATION SUB-ORDER */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5" id="loom-modal-entry-form">
                <div className="flex items-center gap-1.5 mb-4">
                  <PlusCircle size={15} className="text-amber-600" />
                  <span className="text-xs font-black uppercase text-zinc-800 tracking-wider">
                    Quick Specifications Builder: Log New Sub-Order Entry
                  </span>
                </div>

                <form onSubmit={(e) => handleAddSubOrder(e, modalOrder)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                      <label className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Weave Quality / Mix <span className="text-amber-600">*</span></label>
                      <input
                        type="text"
                        value={subQuality}
                        onChange={(e) => setSubQuality(e.target.value)}
                        placeholder="e.g. Milky White"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-3 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Lamination Type <span className="text-amber-600">*</span></label>
                      <select
                        value={subLaminationSelection}
                        onChange={(e) => setSubLaminationSelection(e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2 text-xs font-black text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        <option value="LAMINATION">✨ LAMINATION</option>
                        <option value="NON-LAMINATION">🚫 NON-LAMINATION</option>
                        <option value="other">✍️ OTHER (CUSTOM...)</option>
                      </select>
                      {subLaminationSelection === 'other' && (
                        <input
                          type="text"
                          value={subLaminationCustom}
                          onChange={(e) => setSubLaminationCustom(e.target.value.toUpperCase())}
                          placeholder="SPECIFY CUSTOM LAMINATION..."
                          className="w-full mt-1.5 bg-white border border-zinc-300 rounded-xl py-1 px-2.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                          required
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Size / Width <span className="text-amber-600">*</span></label>
                      <input
                        type="text"
                        value={subSize}
                        onChange={(e) => setSubSize(e.target.value)}
                        placeholder="e.g. 24 inches / 60cm"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-3 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Item Status</label>
                      <select
                        value={subItemStatus}
                        onChange={(e) => setSubItemStatus(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2 text-xs font-black text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        <option value="Pending">🕒 Pending</option>
                        <option value="Production">⚙️ Production</option>
                        <option value="Completed">✅ Completed</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full bg-zinc-950 hover:bg-zinc-850 text-amber-400 font-black text-xs uppercase tracking-wider py-2 rounded-xl border border-zinc-800 transition-all shadow-3xs flex items-center justify-center gap-1"
                      >
                        <Plus size={13} className="stroke-[2.5]" /> Append Sub-order
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-1 border-t border-zinc-200/50">
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">GSM <span className="text-amber-600">*</span></label>
                      <input
                        type="number"
                        step="any"
                        value={subGsm}
                        onChange={(e) => setSubGsm(e.target.value)}
                        placeholder="e.g. 60"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Denier <span className="text-amber-600">*</span></label>
                      <input
                        type="number"
                        step="any"
                        value={subDenier}
                        onChange={(e) => setSubDenier(e.target.value)}
                        placeholder="e.g. 750"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Fabric Wt (g) <span className="text-amber-600">*</span></label>
                      <input
                        type="number"
                        step="any"
                        value={subFabricWeight}
                        onChange={(e) => setSubFabricWeight(e.target.value)}
                        placeholder="e.g. 52"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Target (Tons) <span className="text-amber-600">*</span></label>
                      <input
                        type="number"
                        step="any"
                        value={subTotalQuantity}
                        onChange={(e) => setSubTotalQuantity(e.target.value)}
                        placeholder="e.g. 2.40"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">No. of Rolls</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={decrementSubRolls}
                          className="h-8 w-8 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 rounded-xl border border-zinc-300 flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={subNoOfRolls}
                          onChange={(e) => setSubNoOfRolls(e.target.value)}
                          placeholder="e.g. 100"
                          className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2 text-xs font-mono font-bold text-zinc-800 text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={incrementSubRolls}
                          className="h-8 w-8 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 rounded-xl border border-zinc-300 flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Remarks</label>
                      <input
                        type="text"
                        value={subRemarks}
                        onChange={(e) => setSubRemarks(e.target.value)}
                        placeholder="Standard stitch..."
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </form>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-6 py-4 border-t border-zinc-200 flex justify-end items-center">
              <button
                onClick={() => {
                  setActiveModalOrderId(null);
                  setEditingRowIndex(null);
                }}
                className="bg-zinc-900 hover:bg-zinc-850 text-amber-400 font-extrabold text-xs uppercase tracking-wider py-2 px-6 rounded-xl border border-zinc-800 transition-all shadow-3xs"
              >
                Close specifications ledger
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
