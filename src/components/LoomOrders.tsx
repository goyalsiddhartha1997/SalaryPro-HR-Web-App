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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TrendingUp,
  SlidersHorizontal,
  ChevronRight,
  FileText,
  Activity,
  CheckCircle,
  CheckCircle2,
  ShieldAlert,
  SearchCheck,
  BarChart4,
  ExternalLink,
  PlusCircle,
  Settings,
  Hammer,
  BookOpen,
  Table,
  Download,
  RotateCcw,
  Truck,
  PackageCheck,
  PackageX,
  Filter
} from 'lucide-react';
import { LoomOrder, LoomOrderRow } from '../types';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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

  // --- ORDER EXPORT SELECTION MODAL STATES ---
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportOption, setExportOption] = useState<'dispatched' | 'not_dispatched' | 'both'>('dispatched');

  // --- MASTER ROLL LEDGER EXPORT MODAL STATES ---
  const [isMasterLedgerExportModalOpen, setIsMasterLedgerExportModalOpen] = useState<boolean>(false);
  const [masterLedgerExportOption, setMasterLedgerExportOption] = useState<'dispatched' | 'not_dispatched' | 'both'>('dispatched');

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

  // --- ROLL NUMBERS POP-UP MODAL STATES ---
  const [isRollModalOpen, setIsRollModalOpen] = useState<boolean>(false);
  const [rollModalContext, setRollModalContext] = useState<{
    orderId?: string;
    subOrderIdx?: number;
    isDraftNew?: boolean;
    isInlineEdit?: boolean;
  } | null>(null);
  const [rollModalTitle, setRollModalTitle] = useState<string>('');
  const [rollModalTargetNoOfRolls, setRollModalTargetNoOfRolls] = useState<number>(0);
  const [rollNumbersList, setRollNumbersList] = useState<string[]>([]);
  const [newRollInput, setNewRollInput] = useState<string>('');
  const [bulkRollInput, setBulkRollInput] = useState<string>('');
  const [isBulkRollMode, setIsBulkRollMode] = useState<boolean>(false);
  const [rollSearchQuery, setRollSearchQuery] = useState<string>('');
  const [rollModalDispatchFilter, setRollModalDispatchFilter] = useState<'all' | 'not_dispatched' | 'dispatched'>('all');
  const [selectedRollsForBatch, setSelectedRollsForBatch] = useState<string[]>([]);
  const [selectedLedgerRollIds, setSelectedLedgerRollIds] = useState<string[]>([]);
  const [rollDetailModalItem, setRollDetailModalItem] = useState<any | null>(null);

  // Suborder draft roll numbers (for new sub-order being created)
  const [subRollNumbers, setSubRollNumbers] = useState<string[]>([]);

  // Suborder inline edit roll numbers
  const [inlineRollNumbers, setInlineRollNumbers] = useState<string[]>([]);

  // --- DUPLICATE ROLL NUMBERS AUDIT MODAL STATES ---
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState<boolean>(false);
  const [duplicateSearchQuery, setDuplicateSearchQuery] = useState<string>('');

  // --- MASTER ROLL LEDGER MODAL STATES ---
  type MasterLedgerSortKey = 'rollNo' | 'size' | 'gsm' | 'denier' | 'fabricWeight' | 'grossWt' | 'coreWt' | 'netWt' | 'avgWtCalculated' | 'gsmCalculated' | 'meters' | 'strength' | 'elongation' | 'quality' | 'dispatchStatus' | 'remarks' | 'orderNo';

  const [isMasterLedgerOpen, setIsMasterLedgerOpen] = useState<boolean>(false);
  const [masterLedgerSearchQuery, setMasterLedgerSearchQuery] = useState<string>('');
  const [masterLedgerDispatchFilter, setMasterLedgerDispatchFilter] = useState<'all' | 'not_dispatched' | 'dispatched'>('all');
  const [editingMasterRollId, setEditingMasterRollId] = useState<string | null>(null);

  // Master Ledger Sorting States (Default ascending by Roll Number)
  const [masterLedgerSortKey, setMasterLedgerSortKey] = useState<MasterLedgerSortKey>('rollNo');
  const [masterLedgerSortOrder, setMasterLedgerSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleMasterLedgerSort = (key: MasterLedgerSortKey) => {
    if (masterLedgerSortKey === key) {
      setMasterLedgerSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setMasterLedgerSortKey(key);
      setMasterLedgerSortOrder('asc');
    }
  };

  const getSortColumnLabel = (key: MasterLedgerSortKey) => {
    switch (key) {
      case 'rollNo': return 'Roll Number';
      case 'size': return 'Size';
      case 'gsm': return 'GSM';
      case 'denier': return 'Denier';
      case 'fabricWeight': return 'AVG WT';
      case 'grossWt': return 'Gross Wt (kg)';
      case 'coreWt': return 'Core Wt (kg)';
      case 'netWt': return 'Net Wt (kg)';
      case 'avgWtCalculated': return 'Avg Wt [calc] (grams)';
      case 'gsmCalculated': return 'GSM [calc]';
      case 'meters': return 'Meters';
      case 'strength': return 'Strength';
      case 'elongation': return 'Elongation (%)';
      case 'quality': return 'Weave Quality';
      case 'dispatchStatus': return 'Dispatch Status';
      case 'remarks': return 'Remarks';
      case 'orderNo': return 'Order Ref';
      default: return 'Roll Number';
    }
  };

  // Master Ledger Inline Edit draft fields
  const [masterEditRollNo, setMasterEditRollNo] = useState<string>('');
  const [masterEditSize, setMasterEditSize] = useState<string>('');
  const [masterEditGsm, setMasterEditGsm] = useState<string>('');
  const [masterEditDenier, setMasterEditDenier] = useState<string>('');
  const [masterEditFabricWeight, setMasterEditFabricWeight] = useState<string>('');
  const [masterEditGrossWt, setMasterEditGrossWt] = useState<string>('');
  const [masterEditCoreWt, setMasterEditCoreWt] = useState<string>('');
  const [masterEditNetWt, setMasterEditNetWt] = useState<string>('');
  const [masterEditAvgWtCalculated, setMasterEditAvgWtCalculated] = useState<string>('');
  const [masterEditMeters, setMasterEditMeters] = useState<string>('');
  const [masterEditStrength, setMasterEditStrength] = useState<string>('');
  const [masterEditElongation, setMasterEditElongation] = useState<string>('');
  const [masterEditQuality, setMasterEditQuality] = useState<string>('');
  const [masterEditRemarks, setMasterEditRemarks] = useState<string>('');
  const [masterEditDispatchStatus, setMasterEditDispatchStatus] = useState<'Dispatched' | 'Not Dispatched'>('Not Dispatched');

  const handleMasterEditGrossChange = (val: string) => {
    setMasterEditGrossWt(val);
    const g = parseFloat(val) || 0;
    const c = parseFloat(masterEditCoreWt) || 0;
    const net = Math.max(0, g - c);
    setMasterEditNetWt(net ? String(parseFloat(net.toFixed(3))) : '');
    const m = parseFloat(masterEditMeters) || 0;
    if (m > 0 && net > 0) {
      setMasterEditAvgWtCalculated(String(parseFloat((net / m).toFixed(4))));
    }
  };

  const handleMasterEditCoreChange = (val: string) => {
    setMasterEditCoreWt(val);
    const g = parseFloat(masterEditGrossWt) || 0;
    const c = parseFloat(val) || 0;
    const net = Math.max(0, g - c);
    setMasterEditNetWt(net ? String(parseFloat(net.toFixed(3))) : '');
    const m = parseFloat(masterEditMeters) || 0;
    if (m > 0 && net > 0) {
      setMasterEditAvgWtCalculated(String(parseFloat((net / m).toFixed(4))));
    }
  };

  const handleMasterEditNetChange = (val: string) => {
    setMasterEditNetWt(val);
    const net = parseFloat(val) || 0;
    const m = parseFloat(masterEditMeters) || 0;
    if (m > 0 && net > 0) {
      setMasterEditAvgWtCalculated(String(parseFloat((net / m).toFixed(4))));
    }
  };

  const handleMasterEditMetersChange = (val: string) => {
    setMasterEditMeters(val);
    const m = parseFloat(val) || 0;
    const net = parseFloat(masterEditNetWt) || 0;
    if (m > 0 && net > 0) {
      setMasterEditAvgWtCalculated(String(parseFloat((net / m).toFixed(4))));
    }
  };

  // Master Ledger "Add Roll" panel states
  const [isAddingRollInLedger, setIsAddingRollInLedger] = useState<boolean>(false);
  const [ledgerAddOrderId, setLedgerAddOrderId] = useState<string>('');
  const [ledgerAddSubOrderIdx, setLedgerAddSubOrderIdx] = useState<number>(0);
  const [ledgerAddRollNo, setLedgerAddRollNo] = useState<string>('');

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
  const handleExportOrderToExcel = async (selectedOption: 'dispatched' | 'not_dispatched' | 'both' = exportOption) => {
    if (!modalOrder) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const sheetName = modalOrder.orderNo.substring(0, 30).replace(/[\\/*?:[\]]/g, '') || 'Order';
      const worksheet = workbook.addWorksheet(sheetName);

      // Gridlines visible
      worksheet.views = [{ showGridLines: true }];

      // 1. TOP EXECUTIVE BANNER ROW (Row 1): Company Header & Order Name
      worksheet.mergeCells('A1:K1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `FORTUNE FLEXIPACK PVT LIMITED • PP FABRIC ORDER DETAILS - ${modalOrder.orderNo.toUpperCase()}`;
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Navy
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 42;

      for (let col = 1; col <= 11; col++) {
        const c = worksheet.getRow(1).getCell(col);
        c.fill = titleCell.fill;
        c.border = {
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
        };
      }

      // 2. METRICS CARDS (Rows 2 & 3)
      const greenFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCFCE7' } };
      const greenFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF15803D' } };

      const blueFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDBEAFE' } };
      const blueFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E40AF' } };

      const yellowFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } };
      const yellowFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB45309' } };

      const mintFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD1FAE5' } };
      const mintFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } };

      // Merge ranges for Labels (Row 2) and Values (Row 3)
      worksheet.mergeCells('A2:C2');
      worksheet.mergeCells('D2:F2');
      worksheet.mergeCells('G2:I2');
      worksheet.mergeCells('J2:K2');

      worksheet.mergeCells('A3:C3');
      worksheet.mergeCells('D3:F3');
      worksheet.mergeCells('G3:I3');
      worksheet.mergeCells('J3:K3');

      worksheet.getRow(2).height = 18;
      worksheet.getRow(3).height = 22;

      // Set Labels
      worksheet.getCell('A2').value = 'Target Turnaround Quantity:';
      worksheet.getCell('D2').value = 'Completed Fabric Weight:';
      worksheet.getCell('G2').value = 'Total Recorded Rolls:';
      worksheet.getCell('J2').value = 'Dispatched Rolls:';

      // Set Values
      worksheet.getCell('A3').value = `${modalStats.totalTarget.toFixed(2)} KG`;
      worksheet.getCell('D3').value = `${modalStats.totalCompleted.toFixed(2)} KG`;
      worksheet.getCell('G3').value = `${modalStats.totalRecordedRolls} / ${modalStats.totalRolls} Rolls`;
      worksheet.getCell('J3').value = `${modalStats.totalDispatchedRolls} Dispatched`;

      // Thin border style for metrics cards
      const thinCardBorder = {
        top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      };

      for (let col = 1; col <= 3; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = greenFill;
          c.font = greenFont;
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      for (let col = 4; col <= 6; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = blueFill;
          c.font = blueFont;
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      for (let col = 7; col <= 9; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = yellowFill;
          c.font = yellowFont;
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      for (let col = 10; col <= 11; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = mintFill;
          c.font = mintFont;
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      // 3. TABLE HEADER ROW (Row 5)
      worksheet.getRow(4).height = 10; // spacer row

      let col8Header = 'No. of Rolls';
      let col9Header = 'Roll Numbers List';

      if (selectedOption === 'dispatched') {
        col8Header = 'No. of Dispatched Rolls';
        col9Header = 'Dispatched Roll Numbers List';
      } else if (selectedOption === 'not_dispatched') {
        col8Header = 'No. of Non-Dispatched Rolls';
        col9Header = 'Non-Dispatched Roll Numbers List';
      }

      const headers = [
        '#',
        'Weave Quality',
        'Lamination Type',
        'Size / Width',
        'GSM',
        'Denier',
        'Fabric Weight (g)',
        col8Header,
        col9Header,
        'Target (KG)',
        'Completed (KG)'
      ];

      const headerRow = worksheet.getRow(5);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });

      // 4. DATA ROWS
      const tableData = sortedModalRows.map(({ row }, idx) => {
        const rolls = row.rollNumbers || [];
        const dispList = row.dispatchedRolls || [];
        const dispMap = row.rollDispatchStatus || {};

        let rollCount = row.noOfRolls || 0;
        let rollListStr = rolls.join(', ');

        if (selectedOption === 'dispatched') {
          const dispatchedRolls = rolls.filter(r => {
            const trimmed = (r || '').trim();
            return dispMap[trimmed] === 'Dispatched' || dispList.includes(trimmed);
          });
          rollCount = dispatchedRolls.length;
          rollListStr = dispatchedRolls.length > 0 ? dispatchedRolls.join(', ') : '0 dispatched rolls';
        } else if (selectedOption === 'not_dispatched') {
          const notDispatchedRolls = rolls.filter(r => {
            const trimmed = (r || '').trim();
            return dispMap[trimmed] !== 'Dispatched' && !dispList.includes(trimmed);
          });
          rollCount = notDispatchedRolls.length;
          rollListStr = notDispatchedRolls.length > 0 ? notDispatchedRolls.join(', ') : '0 non-dispatched rolls';
        }

        return [
          idx + 1,
          row.quality || '',
          (row.laminationType || 'NON-LAMINATION').toUpperCase(),
          row.size || '',
          row.gsm || 0,
          row.denier || 0,
          row.fabricWeight || 0,
          rollCount,
          rollListStr,
          row.totalQuantity || 0,
          row.productionCompleted || 0
        ];
      });

      let currentR = 6;
      let totalRollsSum = 0;
      let totalTargetSum = 0;
      let totalCompSum = 0;

      tableData.forEach((rowValues) => {
        const r = worksheet.getRow(currentR);
        r.height = 24;
        const isEven = currentR % 2 === 0;
        const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

        totalRollsSum += Number(rowValues[7]) || 0;
        totalTargetSum += Number(rowValues[9]) || 0;
        totalCompSum += Number(rowValues[10]) || 0;

        rowValues.forEach((val, colIdx) => {
          const cell = r.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          // Alignments & Number Formatting
          if (colIdx === 0) { // #
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF475569' } };
          } else if (colIdx === 1) { // Weave Quality
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
          } else if (colIdx === 2 || colIdx === 3 || colIdx === 4 || colIdx === 5) { // Lamination, Size, GSM, Denier
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colIdx === 6) { // Fabric Weight
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.numFmt = '#,##0.00';
          } else if (colIdx === 7) { // Roll Count
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFB45309' } };
          } else if (colIdx === 8) { // Roll Numbers List
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          } else if (colIdx === 9 || colIdx === 10) { // Target (KG), Completed (KG)
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true };
            cell.numFmt = '#,##0.00';
          }
        });

        currentR++;
      });

      // 5. TOTALS ROW
      const totalsRow = worksheet.getRow(currentR);
      totalsRow.height = 26;
      for (let c = 1; c <= 11; c++) {
        const cell = totalsRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF334155' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      }

      totalsRow.getCell(1).value = 'TOTALS';
      totalsRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      totalsRow.getCell(8).value = totalRollsSum;
      totalsRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      totalsRow.getCell(10).value = totalTargetSum;
      totalsRow.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      totalsRow.getCell(10).numFmt = '#,##0.00';
      totalsRow.getCell(11).value = totalCompSum;
      totalsRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      totalsRow.getCell(11).numFmt = '#,##0.00';

      // 6. COLUMN WIDTHS
      worksheet.columns = [
        { width: 7 },   // #
        { width: 26 },  // Weave Quality
        { width: 18 },  // Lamination Type
        { width: 15 },  // Size / Width
        { width: 10 },  // GSM
        { width: 10 },  // Denier
        { width: 18 },  // Fabric Weight (g)
        { width: 22 },  // Roll Count
        { width: 42 },  // Roll Numbers List
        { width: 18 },  // Target (KG)
        { width: 18 }   // Completed (KG)
      ];

      // 7. WRITE FILE & DOWNLOAD
      const fileNameSuffix = selectedOption === 'both' ? 'Full_Report' : selectedOption === 'dispatched' ? 'Dispatched_Rolls' : 'Not_Dispatched_Rolls';
      const fileName = `PP_Fabric_Order_${modalOrder.orderNo}_${fileNameSuffix}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);

      triggerAlert('success', `Exported ${selectedOption === 'both' ? 'full report' : selectedOption} for Order "${modalOrder.orderNo}" successfully.`);
      setIsExportModalOpen(false);
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

  // Helper to sort roll numbers in ascending natural alphanumeric order
  const sortRollNumbersAscending = (rolls: string[]): string[] => {
    return [...rolls].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  };

  // --- ROLL NUMBERS MODAL HANDLERS ---
  const handleOpenRollModal = (
    context: { orderId?: string; subOrderIdx?: number; isDraftNew?: boolean; isInlineEdit?: boolean },
    title: string,
    targetRolls: number,
    existingRolls: string[]
  ) => {
    setRollModalContext(context);
    setRollModalTitle(title);
    setRollModalTargetNoOfRolls(targetRolls);
    setRollNumbersList(sortRollNumbersAscending(existingRolls || []));
    setNewRollInput('');
    setBulkRollInput('');
    setRollSearchQuery('');
    setRollModalDispatchFilter('all');
    setIsBulkRollMode(false);
    setIsRollModalOpen(true);
  };

  const handleViewRollDetail = (rollNo: string) => {
    const trimmed = (rollNo || '').trim();
    if (!trimmed) return;

    let item = masterRollLedgerData.find(
      m => m.rollNo === trimmed &&
           rollModalContext?.orderId && m.orderId === rollModalContext.orderId &&
           rollModalContext?.subOrderIdx !== undefined && m.subOrderIdx === rollModalContext.subOrderIdx
    );

    if (!item) {
      item = masterRollLedgerData.find(m => m.rollNo === trimmed);
    }

    if (!item) {
      const targetOrder = rollModalContext?.orderId ? orders.find(o => o.id === rollModalContext.orderId) : null;
      const targetSubRow = (targetOrder && rollModalContext?.subOrderIdx !== undefined)
        ? targetOrder.rows[rollModalContext.subOrderIdx]
        : null;

      const dispMap = targetSubRow?.rollDispatchStatus || {};
      const dispList = targetSubRow?.dispatchedRolls || [];
      const isDispatched = dispMap[trimmed] === 'Dispatched' || dispList.includes(trimmed);

      item = {
        id: `fallback___${trimmed}`,
        rollNo: trimmed,
        orderId: targetOrder?.id || '',
        orderNo: targetOrder?.orderNo || 'N/A',
        orderDate: targetOrder?.date || 'N/A',
        subOrderIdx: rollModalContext?.subOrderIdx || 0,
        rollNoIdx: 0,
        size: targetSubRow?.size || 'N/A',
        gsm: targetSubRow?.gsm || 0,
        denier: targetSubRow?.denier || 0,
        fabricWeight: targetSubRow?.fabricWeight || 0,
        grossWt: targetSubRow?.rollGrossWt?.[trimmed] ?? 0,
        coreWt: targetSubRow?.rollCoreWt?.[trimmed] ?? 0,
        netWt: targetSubRow?.rollNetWt?.[trimmed] ?? 0,
        avgWtCalculated: targetSubRow?.rollAvgWtCalculated?.[trimmed] ?? 0,
        meters: targetSubRow?.rollMeters?.[trimmed] ?? 0,
        strength: targetSubRow?.rollStrength?.[trimmed] ?? '',
        elongation: targetSubRow?.rollElongation?.[trimmed] ?? '',
        quality: targetSubRow?.quality || 'N/A',
        remarks: targetSubRow?.rollRemarks?.[trimmed] || '',
        dispatchStatus: isDispatched ? 'Dispatched' : 'Not Dispatched',
      };
    }

    setRollDetailModalItem(item);
  };

  const handleToggleRollDispatchStatusInModal = async (rollNo: string, newStatus: 'Dispatched' | 'Not Dispatched') => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }

    if (!rollModalContext?.orderId || rollModalContext.subOrderIdx === undefined) {
      triggerAlert('info', `Roll status set to ${newStatus}. Save sub-order to persist.`);
      return;
    }

    const targetOrder = orders.find(o => o.id === rollModalContext.orderId);
    if (!targetOrder) {
      triggerAlert('warn', 'Order not found.');
      return;
    }

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[rollModalContext.subOrderIdx]) {
      triggerAlert('warn', 'Sub-order row not found.');
      return;
    }

    const targetRow = { ...updatedRows[rollModalContext.subOrderIdx] };
    const currentDispatchedSet = new Set(targetRow.dispatchedRolls || []);
    const currentDispatchStatusMap = { ...(targetRow.rollDispatchStatus || {}) };

    if (newStatus === 'Dispatched') {
      currentDispatchedSet.add(rollNo);
      currentDispatchStatusMap[rollNo] = 'Dispatched';
    } else {
      currentDispatchedSet.delete(rollNo);
      currentDispatchStatusMap[rollNo] = 'Not Dispatched';
    }

    targetRow.dispatchedRolls = Array.from(currentDispatchedSet);
    targetRow.rollDispatchStatus = currentDispatchStatusMap;
    updatedRows[rollModalContext.subOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      triggerAlert('success', `Roll "${rollNo}" status updated to ${newStatus}.`);
    } catch (err) {
      console.error("Failed to update roll status in modal", err);
      triggerAlert('warn', 'Failed to update roll dispatch status.');
    }
  };

  const handleBulkToggleRollDispatchStatusInModal = async (
    targetRolls: string[],
    newStatus: 'Dispatched' | 'Not Dispatched'
  ) => {
    if (!rollModalContext || targetRolls.length === 0) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }

    const targetOrder = orders.find(o => o.id === rollModalContext.orderId);
    if (!targetOrder || !targetOrder.rows) {
      triggerAlert('warn', 'Order or rows not found.');
      return;
    }

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[rollModalContext.subOrderIdx]) {
      triggerAlert('warn', 'Sub-order row not found.');
      return;
    }

    const targetRow = { ...updatedRows[rollModalContext.subOrderIdx] };
    const currentDispatchedSet = new Set(targetRow.dispatchedRolls || []);
    const currentDispatchStatusMap = { ...(targetRow.rollDispatchStatus || {}) };

    targetRolls.forEach(rollNo => {
      const trimmed = rollNo.trim();
      if (!trimmed) return;
      if (newStatus === 'Dispatched') {
        currentDispatchedSet.add(trimmed);
        currentDispatchStatusMap[trimmed] = 'Dispatched';
      } else {
        currentDispatchedSet.delete(trimmed);
        currentDispatchStatusMap[trimmed] = 'Not Dispatched';
      }
    });

    targetRow.dispatchedRolls = Array.from(currentDispatchedSet);
    targetRow.rollDispatchStatus = currentDispatchStatusMap;
    updatedRows[rollModalContext.subOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      triggerAlert('success', `Successfully set ${targetRolls.length} roll(s) to ${newStatus}.`);
      setSelectedRollsForBatch([]);
    } catch (err) {
      console.error("Failed to bulk update roll dispatch status", err);
      triggerAlert('warn', 'Failed to update roll dispatch statuses.');
    }
  };

  const recalculateRowProductionCompleted = (row: LoomOrderRow): number => {
    const rolls = row.rollNumbers || [];
    if (rolls.length === 0) {
      return row.productionCompleted || 0;
    }
    const rollNetWtMap = row.rollNetWt || {};
    let sumNetWt = 0;
    let hasRecordedWeights = false;
    rolls.forEach((rNo) => {
      if (rNo in rollNetWtMap && typeof rollNetWtMap[rNo] === 'number') {
        sumNetWt += rollNetWtMap[rNo];
        hasRecordedWeights = true;
      }
    });
    if (hasRecordedWeights) {
      return parseFloat(sumNetWt.toFixed(2));
    }
    return row.productionCompleted || 0;
  };

  const syncRollNumbersStateAndFirestore = async (updatedRolls: string[]) => {
    if (!rollModalContext) return;

    const sortedRolls = sortRollNumbersAscending(updatedRolls);

    if (rollModalContext.isDraftNew) {
      setSubRollNumbers(sortedRolls);
      if (!subNoOfRolls || parseInt(subNoOfRolls, 10) < sortedRolls.length) {
        setSubNoOfRolls(String(sortedRolls.length));
      }
    } else if (rollModalContext.isInlineEdit) {
      setInlineRollNumbers(sortedRolls);
      if (!inlineNoOfRolls || parseInt(inlineNoOfRolls, 10) < sortedRolls.length) {
        setInlineNoOfRolls(String(sortedRolls.length));
      }
    } else if (rollModalContext.orderId !== undefined && rollModalContext.subOrderIdx !== undefined) {
      // Saved order in Firestore
      const targetOrder = orders.find(o => o.id === rollModalContext.orderId);
      if (!targetOrder) return;

      const updatedRows = [...targetOrder.rows];
      const targetRow = { ...updatedRows[rollModalContext.subOrderIdx] };

      targetRow.rollNumbers = sortedRolls;
      if (targetRow.noOfRolls === undefined || targetRow.noOfRolls < sortedRolls.length) {
        targetRow.noOfRolls = sortedRolls.length;
      }

      // Clean up orphaned roll metadata for deleted rolls
      const activeRollSet = new Set(sortedRolls);
      if (targetRow.rollGrossWt) { const m = { ...targetRow.rollGrossWt }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollGrossWt = m; }
      if (targetRow.rollCoreWt) { const m = { ...targetRow.rollCoreWt }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollCoreWt = m; }
      if (targetRow.rollNetWt) { const m = { ...targetRow.rollNetWt }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollNetWt = m; }
      if (targetRow.rollAvgWtCalculated) { const m = { ...targetRow.rollAvgWtCalculated }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollAvgWtCalculated = m; }
      if (targetRow.rollMeters) { const m = { ...targetRow.rollMeters }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollMeters = m; }
      if (targetRow.rollStrength) { const m = { ...targetRow.rollStrength }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollStrength = m; }
      if (targetRow.rollElongation) { const m = { ...targetRow.rollElongation }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollElongation = m; }
      if (targetRow.rollRemarks) { const m = { ...targetRow.rollRemarks }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollRemarks = m; }
      if (targetRow.rollDispatchStatus) { const m = { ...targetRow.rollDispatchStatus }; Object.keys(m).forEach(k => { if (!activeRollSet.has(k)) delete m[k]; }); targetRow.rollDispatchStatus = m; }
      if (targetRow.dispatchedRolls) { targetRow.dispatchedRolls = targetRow.dispatchedRolls.filter(r => activeRollSet.has(r)); }

      targetRow.productionCompleted = recalculateRowProductionCompleted(targetRow);

      updatedRows[rollModalContext.subOrderIdx] = targetRow;

      try {
        const orderRef = doc(db, 'loomOrders', targetOrder.id);
        await setDoc(orderRef, {
          ...targetOrder,
          rows: updatedRows
        });
      } catch (err) {
        console.error("Failed to update roll numbers in Firestore", err);
        triggerAlert('warn', 'Failed to save roll numbers update to database.');
      }
    }
  };

  const handleRecordSingleRollNumber = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rollNo = newRollInput.trim();
    if (!rollNo) {
      triggerAlert('warn', 'Please enter a valid Roll Number.');
      return;
    }

    if (rollNumbersList.includes(rollNo)) {
      triggerAlert('warn', `Roll Number "${rollNo}" is already added to this sub-order.`);
      return;
    }

    const updated = sortRollNumbersAscending([...rollNumbersList, rollNo]);
    setRollNumbersList(updated);
    setNewRollInput('');

    await syncRollNumbersStateAndFirestore(updated);
    triggerAlert('success', `Recorded Roll Number "${rollNo}".`);
  };

  const handleRecordBulkRollNumbers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!bulkRollInput.trim()) {
      triggerAlert('warn', 'Please enter comma or line separated roll numbers.');
      return;
    }

    const items = bulkRollInput
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (items.length === 0) {
      triggerAlert('warn', 'No valid roll numbers found in input.');
      return;
    }

    const newAdded: string[] = [];
    const currentSet = new Set<string>(rollNumbersList);

    items.forEach(item => {
      if (!currentSet.has(item)) {
        currentSet.add(item);
        newAdded.push(item);
      }
    });

    if (newAdded.length === 0) {
      triggerAlert('warn', 'All entered roll numbers already exist in this list.');
      return;
    }

    const updated = sortRollNumbersAscending(Array.from(currentSet));
    setRollNumbersList(updated);
    setBulkRollInput('');
    setIsBulkRollMode(false);

    await syncRollNumbersStateAndFirestore(updated);
    triggerAlert('success', `Recorded ${newAdded.length} new roll numbers.`);
  };

  const handleDeleteRollNumber = async (indexToDelete: number) => {
    const updated = sortRollNumbersAscending(rollNumbersList.filter((_, idx) => idx !== indexToDelete));
    setRollNumbersList(updated);

    await syncRollNumbersStateAndFirestore(updated);
    triggerAlert('info', 'Roll number removed.');
  };

  // Add individual sub-order under the active Modal Order or Selected Order
  const handleAddSubOrder = async (e: React.FormEvent, targetOrder: LoomOrder | null) => {
    e.preventDefault();
    if (!targetOrder) return;
    if (viewOnly) {
      triggerAlert('warn', 'Session is read-only.');
      return;
    }

    if (!subQuality.trim()) {
      triggerAlert('warn', 'Weave Quality / Mix is required.');
      return;
    }

    if (!subSize.trim()) {
      triggerAlert('warn', 'Size / Width specification is required.');
      return;
    }

    const gsmVal = parseFloat(subGsm);
    if (isNaN(gsmVal) || gsmVal <= 0) {
      triggerAlert('warn', 'GSM must be a valid positive number.');
      return;
    }

    const denierVal = parseFloat(subDenier);
    if (isNaN(denierVal) || denierVal <= 0) {
      triggerAlert('warn', 'Denier must be a valid positive number.');
      return;
    }

    const fabricWeightVal = parseFloat(subFabricWeight);
    if (isNaN(fabricWeightVal) || fabricWeightVal <= 0) {
      triggerAlert('warn', 'Fabric Weight must be a valid positive number.');
      return;
    }

    const totalQtyVal = parseFloat(subTotalQuantity);
    if (isNaN(totalQtyVal) || totalQtyVal <= 0) {
      triggerAlert('warn', 'Target (KG) must be a valid positive number.');
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
      laminationType: finalLaminationType
    };

    if (rollsVal !== undefined) {
      newSubOrder.noOfRolls = rollsVal;
    } else if (subRollNumbers.length > 0) {
      newSubOrder.noOfRolls = subRollNumbers.length;
    }

    if (subRollNumbers.length > 0) {
      newSubOrder.rollNumbers = subRollNumbers;
    }

    const updatedRows = [...(targetOrder.rows || []), newSubOrder];

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
      setSubRollNumbers([]);
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
    setInlineRollNumbers(row.rollNumbers || []);
    
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
    const existingRow = targetOrder.rows[index] || {};
    const editedRow: LoomOrderRow = {
      ...existingRow,
      size: inlineSize.trim(),
      quality: inlineQuality.trim(),
      gsm: gsmVal,
      denier: denierVal,
      fabricWeight: fabricWeightVal,
      totalQuantity: totalQtyVal,
      productionCompleted: completedQtyVal,
      remarks: inlineRemarks.trim(),
      status: inlineRowStatus,
      laminationType: finalInlineLaminationType
    };

    if (rollsVal !== undefined) {
      editedRow.noOfRolls = rollsVal;
    } else if (inlineRollNumbers.length > 0) {
      editedRow.noOfRolls = inlineRollNumbers.length;
    }

    if (inlineRollNumbers.length > 0) {
      editedRow.rollNumbers = inlineRollNumbers;
    } else if (targetOrder.rows[index]?.rollNumbers) {
      editedRow.rollNumbers = targetOrder.rows[index].rollNumbers;
    }

    updatedRows[index] = editedRow;

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

  // --- DUPLICATE ROLL NUMBERS MULTI-ORDER AUDIT LOGIC ---
  const rollAuditResults = useMemo(() => {
    let totalOrdersScanned = orders.length;
    let totalSubOrdersScanned = 0;
    let totalRollsRecorded = 0;

    const rollOccurrenceMap: Map<string, Array<{
      orderId: string;
      orderNo: string;
      orderDate: string;
      subOrderIdx: number;
      quality: string;
      size: string;
      laminationType?: string;
      gsm?: number;
    }>> = new Map();

    orders.forEach((order) => {
      (order.rows || []).forEach((row, sIdx) => {
        totalSubOrdersScanned++;
        const rolls = row.rollNumbers || [];
        rolls.forEach((r) => {
          const trimmed = (r || '').trim();
          if (trimmed) {
            totalRollsRecorded++;
            const key = trimmed.toUpperCase();
            const existing = rollOccurrenceMap.get(key) || [];
            existing.push({
              orderId: order.id,
              orderNo: order.orderNo,
              orderDate: order.date,
              subOrderIdx: sIdx + 1,
              quality: row.quality || 'Unspecified Quality',
              size: row.size || 'N/A',
              laminationType: row.laminationType,
              gsm: row.gsm
            });
            rollOccurrenceMap.set(key, existing);
          }
        });
      });
    });

    const duplicates: Array<{
      rollNo: string;
      count: number;
      occurrences: Array<{
        orderId: string;
        orderNo: string;
        orderDate: string;
        subOrderIdx: number;
        quality: string;
        size: string;
        laminationType?: string;
        gsm?: number;
      }>;
    }> = [];

    rollOccurrenceMap.forEach((occurrences, key) => {
      if (occurrences.length > 1) {
        duplicates.push({
          rollNo: key,
          count: occurrences.length,
          occurrences
        });
      }
    });

    duplicates.sort((a, b) => b.count - a.count || a.rollNo.localeCompare(b.rollNo));

    return {
      totalOrdersScanned,
      totalSubOrdersScanned,
      totalRollsRecorded,
      totalUniqueRollsCount: rollOccurrenceMap.size,
      duplicatesCount: duplicates.length,
      duplicates
    };
  }, [orders]);

  // --- MASTER ROLL LEDGER DATA AGGREGATOR & EDIT HANDLERS ---
  const masterRollLedgerData = useMemo(() => {
    const list: Array<{
      id: string;
      rollNo: string;
      orderId: string;
      orderNo: string;
      orderDate: string;
      subOrderIdx: number;
      rollNoIdx: number;
      size: string;
      gsm: number;
      denier: number;
      fabricWeight: number;
      grossWt: number;
      coreWt: number;
      netWt: number;
      avgWtCalculated: number;
      meters: number;
      strength: string | number;
      elongation: string | number;
      quality: string;
      remarks: string;
      dispatchStatus: 'Dispatched' | 'Not Dispatched';
    }> = [];

    orders.forEach((order) => {
      (order.rows || []).forEach((row, subIdx) => {
        const rolls = row.rollNumbers || [];
        const dispList = row.dispatchedRolls || [];
        const dispMap = row.rollDispatchStatus || {};

        rolls.forEach((r, rIdx) => {
          const trimmed = (r || '').trim();
          if (trimmed) {
            const isDispatched = dispMap[trimmed] === 'Dispatched' || dispList.includes(trimmed);

            list.push({
              id: `${order.id}___${subIdx}___${rIdx}___${trimmed}`,
              rollNo: trimmed,
              orderId: order.id,
              orderNo: order.orderNo,
              orderDate: order.date,
              subOrderIdx: subIdx,
              rollNoIdx: rIdx,
              size: row.size || '',
              gsm: row.gsm || 0,
              denier: row.denier || 0,
              fabricWeight: row.fabricWeight || 0,
              grossWt: (row.rollGrossWt && row.rollGrossWt[trimmed]) ?? 0,
              coreWt: (row.rollCoreWt && row.rollCoreWt[trimmed]) ?? 0,
              netWt: (row.rollNetWt && row.rollNetWt[trimmed]) ?? 0,
              avgWtCalculated: (row.rollAvgWtCalculated && row.rollAvgWtCalculated[trimmed]) ?? 0,
              meters: (row.rollMeters && row.rollMeters[trimmed]) ?? 0,
              strength: (row.rollStrength && row.rollStrength[trimmed]) ?? '',
              elongation: (row.rollElongation && row.rollElongation[trimmed]) ?? '',
              quality: row.quality || '',
              remarks: (row.rollRemarks && row.rollRemarks[trimmed]) || '',
              dispatchStatus: isDispatched ? 'Dispatched' : 'Not Dispatched',
            });
          }
        });
      });
    });

    // Dynamic sorting based on masterLedgerSortKey & masterLedgerSortOrder
    list.sort((a, b) => {
      let cmp = 0;
      switch (masterLedgerSortKey) {
        case 'rollNo':
          cmp = a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'size':
          cmp = a.size.localeCompare(b.size, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'gsm':
          cmp = a.gsm - b.gsm;
          break;
        case 'denier':
          cmp = a.denier - b.denier;
          break;
        case 'fabricWeight':
          cmp = a.fabricWeight - b.fabricWeight;
          break;
        case 'grossWt':
          cmp = a.grossWt - b.grossWt;
          break;
        case 'coreWt':
          cmp = a.coreWt - b.coreWt;
          break;
        case 'netWt':
          cmp = a.netWt - b.netWt;
          break;
        case 'avgWtCalculated':
          cmp = a.avgWtCalculated - b.avgWtCalculated;
          break;
        case 'gsmCalculated': {
          const szA = parseFloat(String(a.size || '').replace(/[^0-9.]/g, '')) || 0;
          const avgA = Number(a.avgWtCalculated) || 0;
          const gsmA = (szA > 0 && avgA > 0) ? avgA / szA : 0;
          const szB = parseFloat(String(b.size || '').replace(/[^0-9.]/g, '')) || 0;
          const avgB = Number(b.avgWtCalculated) || 0;
          const gsmB = (szB > 0 && avgB > 0) ? avgB / szB : 0;
          cmp = gsmA - gsmB;
          break;
        }
        case 'meters':
          cmp = a.meters - b.meters;
          break;
        case 'strength':
          cmp = String(a.strength).localeCompare(String(b.strength), undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'elongation':
          cmp = (Number(a.elongation) || 0) - (Number(b.elongation) || 0);
          break;
        case 'quality':
          cmp = a.quality.localeCompare(b.quality, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'dispatchStatus':
          cmp = a.dispatchStatus.localeCompare(b.dispatchStatus);
          break;
        case 'remarks':
          cmp = a.remarks.localeCompare(b.remarks);
          break;
        case 'orderNo':
          cmp = a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true, sensitivity: 'base' });
          break;
        default:
          cmp = a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true, sensitivity: 'base' });
      }

      // Tie-breaker: sort by rollNo ascending
      if (cmp === 0) {
        cmp = a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true, sensitivity: 'base' });
      }

      return masterLedgerSortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [orders, masterLedgerSortKey, masterLedgerSortOrder]);

  // Master Ledger Inline Edit Handlers
  const handleStartEditMasterRoll = (item: typeof masterRollLedgerData[0]) => {
    setEditingMasterRollId(item.id);
    setMasterEditRollNo(item.rollNo);
    setMasterEditSize(item.size);
    setMasterEditGsm(item.gsm ? String(item.gsm) : '');
    setMasterEditDenier(item.denier ? String(item.denier) : '');
    setMasterEditFabricWeight(item.fabricWeight ? String(item.fabricWeight) : '');
    setMasterEditGrossWt(item.grossWt ? String(item.grossWt) : '');
    setMasterEditCoreWt(item.coreWt ? String(item.coreWt) : '');
    setMasterEditNetWt(item.netWt ? String(item.netWt) : '');
    setMasterEditAvgWtCalculated(item.avgWtCalculated ? String(item.avgWtCalculated) : '');
    setMasterEditMeters(item.meters ? String(item.meters) : '');
    setMasterEditStrength(item.strength ? String(item.strength) : '');
    setMasterEditElongation(item.elongation ? String(item.elongation) : '');
    setMasterEditQuality(item.quality);
    setMasterEditRemarks(item.remarks);
    setMasterEditDispatchStatus(item.dispatchStatus);
  };

  const handleCancelEditMasterRoll = () => {
    setEditingMasterRollId(null);
  };

  const handleUpdateRollDispatchStatus = async (item: typeof masterRollLedgerData[0], newStatus: 'Dispatched' | 'Not Dispatched') => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }

    const targetOrder = orders.find(o => o.id === item.orderId);
    if (!targetOrder) {
      triggerAlert('warn', 'Order not found.');
      return;
    }

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[item.subOrderIdx]) {
      triggerAlert('warn', 'Sub-order row not found.');
      return;
    }

    const targetRow = { ...updatedRows[item.subOrderIdx] };
    const currentDispatchedSet = new Set(targetRow.dispatchedRolls || []);
    const currentDispatchStatusMap = { ...(targetRow.rollDispatchStatus || {}) };

    if (newStatus === 'Dispatched') {
      currentDispatchedSet.add(item.rollNo);
      currentDispatchStatusMap[item.rollNo] = 'Dispatched';
    } else {
      currentDispatchedSet.delete(item.rollNo);
      currentDispatchStatusMap[item.rollNo] = 'Not Dispatched';
    }

    targetRow.dispatchedRolls = Array.from(currentDispatchedSet);
    targetRow.rollDispatchStatus = currentDispatchStatusMap;
    updatedRows[item.subOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      triggerAlert('success', `Roll "${item.rollNo}" status updated to ${newStatus}.`);
    } catch (err) {
      console.error("Failed to update roll dispatch status", err);
      triggerAlert('warn', 'Failed to update dispatch status in database.');
    }
  };

  const handleSaveMasterRollEdit = async (item: typeof masterRollLedgerData[0]) => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }

    const trimmedNewRollNo = masterEditRollNo.trim();
    if (!trimmedNewRollNo) {
      triggerAlert('warn', 'Roll number cannot be empty.');
      return;
    }

    const targetOrder = orders.find(o => o.id === item.orderId);
    if (!targetOrder) {
      triggerAlert('warn', 'Order not found.');
      return;
    }

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[item.subOrderIdx]) {
      triggerAlert('warn', 'Sub-order row not found.');
      return;
    }

    const targetRow = { ...updatedRows[item.subOrderIdx] };
    const rollsArray = [...(targetRow.rollNumbers || [])];

    let targetRollIdx = item.rollNoIdx;
    if (targetRollIdx < 0 || targetRollIdx >= rollsArray.length || rollsArray[targetRollIdx] !== item.rollNo) {
      targetRollIdx = rollsArray.indexOf(item.rollNo);
    }

    if (targetRollIdx === -1) {
      triggerAlert('warn', `Roll "${item.rollNo}" could not be located in Order #${item.orderNo}.`);
      return;
    }

    // Replace roll number and sort ascending
    rollsArray[targetRollIdx] = trimmedNewRollNo;
    targetRow.rollNumbers = sortRollNumbersAscending(rollsArray);

    // Update sub-order row specs
    targetRow.size = masterEditSize.trim();
    targetRow.gsm = Number(masterEditGsm) || 0;
    targetRow.denier = Number(masterEditDenier) || 0;
    targetRow.fabricWeight = Number(masterEditFabricWeight) || 0;
    targetRow.quality = masterEditQuality.trim();

    // Store per-roll remarks and per-roll weight/meter maps
    const existingRollRemarks = { ...(targetRow.rollRemarks || {}) };
    const existingRollGrossWt = { ...(targetRow.rollGrossWt || {}) };
    const existingRollCoreWt = { ...(targetRow.rollCoreWt || {}) };
    const existingRollNetWt = { ...(targetRow.rollNetWt || {}) };
    const existingRollAvgWtCalculated = { ...(targetRow.rollAvgWtCalculated || {}) };
    const existingRollMeters = { ...(targetRow.rollMeters || {}) };
    const existingRollStrength = { ...(targetRow.rollStrength || {}) };
    const existingRollElongation = { ...(targetRow.rollElongation || {}) };

    if (item.rollNo !== trimmedNewRollNo) {
      if (item.rollNo in existingRollRemarks) delete existingRollRemarks[item.rollNo];
      if (item.rollNo in existingRollGrossWt) delete existingRollGrossWt[item.rollNo];
      if (item.rollNo in existingRollCoreWt) delete existingRollCoreWt[item.rollNo];
      if (item.rollNo in existingRollNetWt) delete existingRollNetWt[item.rollNo];
      if (item.rollNo in existingRollAvgWtCalculated) delete existingRollAvgWtCalculated[item.rollNo];
      if (item.rollNo in existingRollMeters) delete existingRollMeters[item.rollNo];
      if (item.rollNo in existingRollStrength) delete existingRollStrength[item.rollNo];
      if (item.rollNo in existingRollElongation) delete existingRollElongation[item.rollNo];
    }

    existingRollRemarks[trimmedNewRollNo] = masterEditRemarks.trim();
    existingRollGrossWt[trimmedNewRollNo] = Number(masterEditGrossWt) || 0;
    existingRollCoreWt[trimmedNewRollNo] = Number(masterEditCoreWt) || 0;
    existingRollNetWt[trimmedNewRollNo] = Number(masterEditNetWt) || 0;
    existingRollAvgWtCalculated[trimmedNewRollNo] = Number(masterEditAvgWtCalculated) || 0;
    existingRollMeters[trimmedNewRollNo] = Number(masterEditMeters) || 0;
    existingRollStrength[trimmedNewRollNo] = masterEditStrength.trim();
    existingRollElongation[trimmedNewRollNo] = masterEditElongation.trim();

    targetRow.rollRemarks = existingRollRemarks;
    targetRow.rollGrossWt = existingRollGrossWt;
    targetRow.rollCoreWt = existingRollCoreWt;
    targetRow.rollNetWt = existingRollNetWt;
    targetRow.rollAvgWtCalculated = existingRollAvgWtCalculated;
    targetRow.rollMeters = existingRollMeters;
    targetRow.rollStrength = existingRollStrength;
    targetRow.rollElongation = existingRollElongation;

    // Update dispatch status
    const currentDispatchedSet = new Set(targetRow.dispatchedRolls || []);
    const currentDispatchStatusMap = { ...(targetRow.rollDispatchStatus || {}) };

    if (item.rollNo !== trimmedNewRollNo) {
      currentDispatchedSet.delete(item.rollNo);
      delete currentDispatchStatusMap[item.rollNo];
    }

    if (masterEditDispatchStatus === 'Dispatched') {
      currentDispatchedSet.add(trimmedNewRollNo);
      currentDispatchStatusMap[trimmedNewRollNo] = 'Dispatched';
    } else {
      currentDispatchedSet.delete(trimmedNewRollNo);
      currentDispatchStatusMap[trimmedNewRollNo] = 'Not Dispatched';
    }

    targetRow.dispatchedRolls = Array.from(currentDispatchedSet);
    targetRow.rollDispatchStatus = currentDispatchStatusMap;
    targetRow.productionCompleted = recalculateRowProductionCompleted(targetRow);

    updatedRows[item.subOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      setEditingMasterRollId(null);
      triggerAlert('success', `Roll "${trimmedNewRollNo}" details updated successfully.`);
    } catch (err) {
      console.error("Failed to save master roll edit", err);
      triggerAlert('warn', 'Failed to save changes to database.');
    }
  };

  const handleDeleteMasterRoll = async (item: typeof masterRollLedgerData[0]) => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete Roll "${item.rollNo}" from Order #${item.orderNo}?`)) {
      return;
    }

    const targetOrder = orders.find(o => o.id === item.orderId);
    if (!targetOrder) return;

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[item.subOrderIdx]) return;

    const targetRow = { ...updatedRows[item.subOrderIdx] };
    const rollsArray = [...(targetRow.rollNumbers || [])];

    let targetRollIdx = item.rollNoIdx;
    if (targetRollIdx < 0 || targetRollIdx >= rollsArray.length || rollsArray[targetRollIdx] !== item.rollNo) {
      targetRollIdx = rollsArray.indexOf(item.rollNo);
    }

    if (targetRollIdx !== -1) {
      rollsArray.splice(targetRollIdx, 1);
    }

    targetRow.rollNumbers = sortRollNumbersAscending(rollsArray);
    if (targetRow.dispatchedRolls) {
      targetRow.dispatchedRolls = targetRow.dispatchedRolls.filter(r => r !== item.rollNo);
    }
    if (targetRow.rollDispatchStatus) {
      const updatedMap = { ...targetRow.rollDispatchStatus };
      delete updatedMap[item.rollNo];
      targetRow.rollDispatchStatus = updatedMap;
    }
    if (targetRow.rollGrossWt) { const m = { ...targetRow.rollGrossWt }; delete m[item.rollNo]; targetRow.rollGrossWt = m; }
    if (targetRow.rollCoreWt) { const m = { ...targetRow.rollCoreWt }; delete m[item.rollNo]; targetRow.rollCoreWt = m; }
    if (targetRow.rollNetWt) { const m = { ...targetRow.rollNetWt }; delete m[item.rollNo]; targetRow.rollNetWt = m; }
    if (targetRow.rollAvgWtCalculated) { const m = { ...targetRow.rollAvgWtCalculated }; delete m[item.rollNo]; targetRow.rollAvgWtCalculated = m; }
    if (targetRow.rollMeters) { const m = { ...targetRow.rollMeters }; delete m[item.rollNo]; targetRow.rollMeters = m; }
    if (targetRow.rollStrength) { const m = { ...targetRow.rollStrength }; delete m[item.rollNo]; targetRow.rollStrength = m; }
    if (targetRow.rollElongation) { const m = { ...targetRow.rollElongation }; delete m[item.rollNo]; targetRow.rollElongation = m; }

    targetRow.productionCompleted = recalculateRowProductionCompleted(targetRow);
    updatedRows[item.subOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      triggerAlert('success', `Roll "${item.rollNo}" removed from Order #${item.orderNo}.`);
    } catch (err) {
      console.error("Failed to delete master roll", err);
      triggerAlert('warn', 'Failed to remove roll.');
    }
  };

  const handleAddMasterRollDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }

    const trimmedRollNo = ledgerAddRollNo.trim();
    if (!trimmedRollNo) {
      triggerAlert('warn', 'Please enter a valid Roll Number.');
      return;
    }

    if (!ledgerAddOrderId) {
      triggerAlert('warn', 'Please select an Order.');
      return;
    }

    const targetOrder = orders.find(o => o.id === ledgerAddOrderId);
    if (!targetOrder) {
      triggerAlert('warn', 'Selected order was not found.');
      return;
    }

    const updatedRows = [...(targetOrder.rows || [])];
    if (!updatedRows[ledgerAddSubOrderIdx]) {
      triggerAlert('warn', 'Selected sub-order was not found.');
      return;
    }

    const targetRow = { ...updatedRows[ledgerAddSubOrderIdx] };
    const currentRolls = [...(targetRow.rollNumbers || [])];

    if (currentRolls.includes(trimmedRollNo)) {
      triggerAlert('warn', `Roll "${trimmedRollNo}" already exists in Sub-Order #${ledgerAddSubOrderIdx + 1}.`);
      return;
    }

    currentRolls.push(trimmedRollNo);
    targetRow.rollNumbers = sortRollNumbersAscending(currentRolls);
    if (targetRow.noOfRolls === undefined || targetRow.noOfRolls < targetRow.rollNumbers.length) {
      targetRow.noOfRolls = targetRow.rollNumbers.length;
    }

    targetRow.productionCompleted = recalculateRowProductionCompleted(targetRow);
    updatedRows[ledgerAddSubOrderIdx] = targetRow;

    try {
      const orderRef = doc(db, 'loomOrders', targetOrder.id);
      await setDoc(orderRef, {
        ...targetOrder,
        rows: updatedRows
      });
      setLedgerAddRollNo('');
      setIsAddingRollInLedger(false);
      triggerAlert('success', `Added Roll "${trimmedRollNo}" to Order #${targetOrder.orderNo}.`);
    } catch (err) {
      console.error("Failed to add roll from master ledger", err);
      triggerAlert('warn', 'Failed to add roll.');
    }
  };

  const handleExportMasterRollLedgerToExcel = async (selectedOption: 'dispatched' | 'not_dispatched' | 'both' = masterLedgerExportOption) => {
    try {
      let filteredData = masterRollLedgerData;
      let modeTitle = 'FULL REPORT';
      let fileNameSuffix = 'Full_Report';

      if (selectedOption === 'dispatched') {
        filteredData = masterRollLedgerData.filter(item => item.dispatchStatus === 'Dispatched');
        modeTitle = 'DISPATCHED ROLLS ONLY';
        fileNameSuffix = 'Dispatched_Rolls';
      } else if (selectedOption === 'not_dispatched') {
        filteredData = masterRollLedgerData.filter(item => item.dispatchStatus === 'Not Dispatched');
        modeTitle = 'NON-DISPATCHED ROLLS ONLY';
        fileNameSuffix = 'Not_Dispatched_Rolls';
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Master Roll Ledger');
      worksheet.views = [{ showGridLines: true }];

      // 1. TOP BANNER ROW (Row 1)
      worksheet.mergeCells('A1:P1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `FORTUNE FLEXIPACK PVT LIMITED • MASTER ROLL DIRECTORY LEDGER - ${modeTitle}`;
      titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 40;

      for (let col = 1; col <= 16; col++) {
        worksheet.getRow(1).getCell(col).fill = titleCell.fill;
      }

      // 2. METRICS CARDS (Rows 2 & 3)
      const totalCount = masterRollLedgerData.length;
      const dispCount = masterRollLedgerData.filter(i => i.dispatchStatus === 'Dispatched').length;
      const notDispCount = totalCount - dispCount;

      worksheet.mergeCells('A2:D2');
      worksheet.mergeCells('E2:J2');
      worksheet.mergeCells('K2:P2');

      worksheet.mergeCells('A3:D3');
      worksheet.mergeCells('E3:J3');
      worksheet.mergeCells('K3:P3');

      worksheet.getRow(2).height = 18;
      worksheet.getRow(3).height = 22;

      worksheet.getCell('A2').value = 'Total Registered Rolls:';
      worksheet.getCell('E2').value = 'Dispatched Rolls:';
      worksheet.getCell('K2').value = 'Non-Dispatched Rolls:';

      worksheet.getCell('A3').value = `${totalCount} Rolls`;
      worksheet.getCell('E3').value = `${dispCount} Rolls (${totalCount > 0 ? Math.round((dispCount / totalCount) * 100) : 0}%)`;
      worksheet.getCell('K3').value = `${notDispCount} Rolls (${totalCount > 0 ? Math.round((notDispCount / totalCount) * 100) : 0}%)`;

      const thinCardBorder = {
        top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      };

      for (let col = 1; col <= 4; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
          c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E40AF' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      for (let col = 5; col <= 10; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF15803D' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      for (let col = 11; col <= 16; col++) {
        [2, 3].forEach(r => {
          const c = worksheet.getRow(r).getCell(col);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
          c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFC2410C' } };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
          c.border = thinCardBorder;
        });
      }

      // 3. TABLE HEADER ROW (Row 5)
      worksheet.getRow(4).height = 10;
      const headers = [
        'Roll Number',
        'Size',
        'GSM',
        'Denier',
        'AVG WT (g)',
        'Gross Wt (kg)',
        'Core Wt (kg)',
        'Net Wt (kg)',
        'Avg Wt [calc] (grams)',
        'GSM [calc]',
        'Meters',
        'Strength',
        'Elongation (%)',
        'Weave Quality',
        'Dispatch Status',
        'Remarks',
        'Order No'
      ];

      const headerRow = worksheet.getRow(5);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });

      // 4. DATA ROWS
      let currentR = 6;
      filteredData.forEach((item) => {
        const r = worksheet.getRow(currentR);
        r.height = 22;
        const isEven = currentR % 2 === 0;
        const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

        const szVal = parseFloat(String(item.size || '').replace(/[^0-9.]/g, '')) || 0;
        const avgVal = Number(item.avgWtCalculated) || 0;
        const gsmCalcVal = (szVal > 0 && avgVal > 0) ? parseFloat((avgVal / szVal).toFixed(2)) : 0;

        const rowValues = [
          item.rollNo,
          item.size,
          item.gsm,
          item.denier,
          item.fabricWeight,
          item.grossWt || 0,
          item.coreWt || 0,
          item.netWt || 0,
          item.avgWtCalculated || 0,
          gsmCalcVal,
          item.meters || 0,
          item.strength || '-',
          item.elongation || '-',
          item.quality,
          item.dispatchStatus,
          item.remarks || '-',
          item.orderNo
        ];

        rowValues.forEach((val, colIdx) => {
          const cell = r.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (colIdx === 0) { // Roll Number
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFB45309' } };
          } else if (colIdx === 1 || colIdx === 2 || colIdx === 3) { // Size, GSM, Denier
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colIdx >= 4 && colIdx <= 10) { // Fabric Wt, Gross, Core, Net, Avg, GSM calc, Meters
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            cell.numFmt = colIdx === 8 ? '#,##0.0000' : '#,##0.00';
          } else if (colIdx === 11 || colIdx === 12) { // Strength, Elongation
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true };
          } else if (colIdx === 13) { // Quality
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true };
          } else if (colIdx === 14) { // Dispatch Status
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (val === 'Dispatched') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
              cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF15803D' } };
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
              cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFC2410C' } };
            }
          } else if (colIdx === 15) { // Remarks
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (colIdx === 16) { // Order No
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });

        currentR++;
      });

      // 5. COLUMN WIDTHS
      worksheet.columns = [
        { width: 18 },  // Roll Number
        { width: 14 },  // Size
        { width: 10 },  // GSM
        { width: 10 },  // Denier
        { width: 18 },  // Fabric Weight
        { width: 16 },  // Gross Wt (kg)
        { width: 14 },  // Core Wt (kg)
        { width: 14 },  // Net Wt (kg)
        { width: 20 },  // Avg Wt [calc] (grams)
        { width: 14 },  // GSM [calc]
        { width: 14 },  // Meters
        { width: 14 },  // Strength
        { width: 16 },  // Elongation (%)
        { width: 24 },  // Weave Quality
        { width: 18 },  // Dispatch Status
        { width: 26 },  // Remarks
        { width: 16 }   // Order No
      ];

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `PP_Fabric_Master_Roll_Ledger_${fileNameSuffix}_${dateStr}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);

      triggerAlert('success', `Master Roll Ledger (${modeTitle}) exported to Excel successfully.`);
      setIsMasterLedgerExportModalOpen(false);
    } catch (err) {
      console.error("Failed to export Master Roll Ledger", err);
      triggerAlert('warn', 'Failed to export ledger to Excel.');
    }
  };

  // Aggregate stats for the currently opened Modal Order
  const modalStats = useMemo(() => {
    if (!modalOrder) return { 
      totalTarget: 0, 
      totalCompleted: 0, 
      completionRate: 0, 
      pendingCount: 0, 
      prodCount: 0, 
      compCount: 0, 
      totalRollsReady: 0, 
      totalRolls: 0, 
      totalDispatchedRolls: 0, 
      totalNotDispatchedRolls: 0,
      totalRecordedRolls: 0,
      totalRecordedNetWt: 0,
      totalDispatchedNetWt: 0,
      totalNotDispatchedNetWt: 0
    };
    
    let totalTarget = 0;
    let totalCompleted = 0;
    let pendingCount = 0;
    let prodCount = 0;
    let compCount = 0;
    let totalRollsReady = 0;
    let totalRolls = 0;
    let totalDispatchedRolls = 0;
    let totalNotDispatchedRolls = 0;
    let totalRecordedRolls = 0;

    let totalRecordedNetWt = 0;
    let totalDispatchedNetWt = 0;
    let totalNotDispatchedNetWt = 0;

    (modalOrder.rows || []).forEach(r => {
      totalTarget += r.totalQuantity || 0;
      totalCompleted += (r.productionCompleted || 0);
      
      const rolls = r.noOfRolls || 0;
      totalRolls += rolls;

      const rollList = r.rollNumbers || [];
      totalRecordedRolls += rollList.length;
      const dispSet = new Set(r.dispatchedRolls || []);
      const dispMap = r.rollDispatchStatus || {};
      const rollNetWtMap = r.rollNetWt || {};

      rollList.forEach(rollNo => {
        const trimmed = rollNo.trim();
        const nw = Number(rollNetWtMap[trimmed]) || 0;
        totalRecordedNetWt += nw;

        const isDispatched = dispMap[trimmed] === 'Dispatched' || dispSet.has(trimmed);
        if (isDispatched) {
          totalDispatchedRolls++;
          totalDispatchedNetWt += nw;
        } else {
          totalNotDispatchedRolls++;
          totalNotDispatchedNetWt += nw;
        }
      });

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
      totalRolls,
      totalDispatchedRolls,
      totalNotDispatchedRolls,
      totalRecordedRolls,
      totalRecordedNetWt,
      totalDispatchedNetWt,
      totalNotDispatchedNetWt
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
            Heavy-duty registry to organize factory weaving grids, allocate weight metrics, and manage custom fabric specifications.
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
              <p className="text-[8px] font-black uppercase text-zinc-400 leading-none tracking-wider">Ledger Weight</p>
              <p className="text-xs font-black text-orange-400 mt-0.5 leading-none font-mono">
                {ledgerStats.totalCompleted.toFixed(2)} / {ledgerStats.totalTarget.toFixed(2)} KG
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
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <SlidersHorizontal size={12} className="text-zinc-500" />
                <span>Refine Loom ledger search</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setMasterLedgerSearchQuery('');
                    setEditingMasterRollId(null);
                    setIsMasterLedgerOpen(true);
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-zinc-800 shadow-3xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Open Master Roll Ledger window for all orders & sub-orders"
                >
                  <BookOpen size={15} className="shrink-0 text-amber-400" />
                  <span>Master Roll Ledger</span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono border border-amber-400/30">
                    {masterRollLedgerData.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDuplicateSearchQuery('');
                    setIsDuplicateModalOpen(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-amber-600 shadow-3xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Audit all orders and sub-orders for duplicate roll numbers"
                >
                  <ShieldAlert size={15} className="shrink-0 text-zinc-950" />
                  <span>Check Duplicate Rolls</span>
                  {rollAuditResults.duplicatesCount > 0 && (
                    <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                      {rollAuditResults.duplicatesCount}
                    </span>
                  )}
                </button>
              </div>
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
                    <th className="py-3.5 px-3 text-[10.5px] font-black uppercase tracking-wider text-right whitespace-nowrap w-[125px]">Target Weight (KG)</th>
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
                              KG Logged
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
                          <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Target Weight (KG)</p>
                          <p className="font-bold text-zinc-800 font-mono mt-0.5">{totalCompleted.toFixed(2)} / {totalTarget.toFixed(2)} KG</p>
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
                  onClick={() => {
                    setExportOption('dispatched');
                    setIsExportModalOpen(true);
                  }}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                
                {/* Metric 1: Turnaround target */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Turnaround Target
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-amber-400 border border-zinc-800 shrink-0">
                      <BarChart4 size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-base font-black text-zinc-900 font-mono block">
                      {modalStats.totalTarget.toFixed(2)} KG
                    </span>
                    <span className="text-[10px] text-zinc-500 font-bold block mt-0.5">
                      Target volume
                    </span>
                  </div>
                </div>

                {/* Metric 2: Completed Fabric */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Completed Fabric
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950 shrink-0">
                      <CheckCircle size={15} className="stroke-[2.5]" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-base font-black text-emerald-600 font-mono block">
                      {modalStats.totalCompleted.toFixed(2)} KG
                    </span>
                    <span className="text-[10px] text-zinc-500 font-semibold block mt-0.5">
                      {modalStats.completionRate.toFixed(1)}% completed
                    </span>
                  </div>
                </div>

                {/* Metric 3: Total Rolls */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Total Rolls
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-blue-400 border border-zinc-800 shrink-0">
                      <Layers size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-base font-black text-blue-600 font-mono block">
                      {modalStats.totalRecordedRolls} Rolls
                    </span>
                    <div className="text-[10px] text-blue-800 font-mono font-extrabold mt-0.5 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200/60 inline-block">
                      {modalStats.totalRecordedNetWt.toFixed(2)} KG Net Wt
                    </div>
                  </div>
                </div>

                {/* Metric 4: Dispatched Rolls */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Dispatched Rolls
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white border border-emerald-700 shadow-3xs shrink-0">
                      <Truck size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-base font-black text-emerald-700 font-mono block">
                      {modalStats.totalDispatchedRolls} Dispatched
                    </span>
                    <div className="text-[10px] text-emerald-800 font-mono font-extrabold mt-0.5 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80 inline-block">
                      {modalStats.totalDispatchedNetWt.toFixed(2)} KG Net Wt
                    </div>
                  </div>
                </div>

                {/* Metric 5: Not Dispatched Rolls */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none">
                      Not Dispatched Rolls
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-zinc-950 border border-amber-600 shadow-3xs shrink-0">
                      <PackageX size={15} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-base font-black text-amber-700 font-mono block">
                      {modalStats.totalNotDispatchedRolls} Not Dispatched
                    </span>
                    <div className="text-[10px] text-amber-900 font-mono font-extrabold mt-0.5 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80 inline-block">
                      {modalStats.totalNotDispatchedNetWt.toFixed(2)} KG Net Wt
                    </div>
                  </div>
                </div>

                {/* Metric 6: Sub-order Status Breakdown */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl flex flex-col justify-between shadow-3xs">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block leading-none mb-1">
                    Status Breakdown
                  </span>
                  
                  <div className="grid grid-cols-3 gap-1.5 text-center mt-1">
                    <div className="bg-white border border-zinc-200/80 rounded-lg p-1.5">
                      <p className="text-[7.5px] font-extrabold text-zinc-400 uppercase leading-none">Pending</p>
                      <p className="text-xs font-black text-amber-600 font-mono mt-0.5">{modalStats.pendingCount}</p>
                    </div>
                    <div className="bg-white border border-zinc-200/80 rounded-lg p-1.5">
                      <p className="text-[7.5px] font-extrabold text-zinc-400 uppercase leading-none">In Prod</p>
                      <p className="text-xs font-black text-orange-600 font-mono mt-0.5">{modalStats.prodCount}</p>
                    </div>
                    <div className="bg-white border border-zinc-200/80 rounded-lg p-1.5">
                      <p className="text-[7.5px] font-extrabold text-zinc-400 uppercase leading-none">Done</p>
                      <p className="text-xs font-black text-emerald-600 font-mono mt-0.5">{modalStats.compCount}</p>
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
                    <div className="hidden md:block overflow-auto max-h-[60vh]">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-zinc-100 shadow-2xs">
                          <tr className="bg-zinc-100 text-zinc-600 border-b border-zinc-200">
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[40px] bg-zinc-100">#</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[140px] bg-zinc-100">Weave Quality</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[130px] bg-zinc-100">Lamination Type</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[100px] bg-zinc-100">Size</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[70px] bg-zinc-100">GSM</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[75px] bg-zinc-100">Denier</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[85px] bg-zinc-100">Fabric Wt (g)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[125px] bg-zinc-100">No. of Rolls</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right w-[95px] bg-zinc-100">Target (KG)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right w-[110px] bg-zinc-100">Completed (KG)</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-center w-[100px] bg-zinc-100">Status</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase min-w-[150px] bg-zinc-100">Remarks</th>
                            <th className="py-2.5 px-3 text-[9px] font-extrabold uppercase text-right min-w-[110px] bg-zinc-100">Actions</th>
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
                                    <div className="flex flex-col items-center gap-1 min-w-[120px]">
                                      <div className="flex items-center gap-1 justify-center">
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
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleOpenRollModal(
                                            { isInlineEdit: true, orderId: modalOrder.id, subOrderIdx: originalIndex },
                                            `Edit: ${inlineQuality || 'Quality'} - ${inlineSize || 'Size'}`,
                                            parseInt(inlineNoOfRolls, 10) || 0,
                                            inlineRollNumbers
                                          );
                                        }}
                                        className="text-[9.5px] font-extrabold text-amber-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <Layers size={10} className="text-amber-600" />
                                        <span>Record Rolls ({inlineRollNumbers.length})</span>
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

                                <td className="py-3 px-3 text-center">
                                  {(() => {
                                    const rowDispatchedCount = (row.rollNumbers || []).filter(r => {
                                      const trimmed = r.trim();
                                      const dispMap = row.rollDispatchStatus || {};
                                      const dispList = row.dispatchedRolls || [];
                                      return dispMap[trimmed] === 'Dispatched' || dispList.includes(trimmed);
                                    }).length;

                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleOpenRollModal(
                                            { orderId: modalOrder.id, subOrderIdx: originalIndex },
                                            `${row.quality} - ${row.size} (${row.gsm} GSM)`,
                                            row.noOfRolls || 0,
                                            row.rollNumbers || []
                                          );
                                        }}
                                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-250 font-mono text-xs font-black transition-all shadow-3xs cursor-pointer group hover:scale-[1.02]"
                                        title="Click to View & Record Roll Numbers"
                                      >
                                        <Layers size={13} className="text-amber-600 group-hover:scale-110 transition-transform" />
                                        <span>{row.noOfRolls !== undefined ? `${row.noOfRolls} rolls` : '0 rolls'}</span>
                                        {(row.rollNumbers?.length || 0) > 0 && (
                                          <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-sans font-black">
                                            {row.rollNumbers?.length} rec
                                          </span>
                                        )}
                                        {rowDispatchedCount > 0 && (
                                          <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-sans font-black flex items-center gap-0.5">
                                            <Truck size={9} /> {rowDispatchedCount} disp
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })()}
                                </td>

                                <td className="py-3 px-3 text-right font-mono text-xs font-black text-zinc-900">
                                  {row.totalQuantity.toFixed(2)} KG
                                </td>

                                <td className="py-3 px-3 text-right font-mono text-xs font-black text-emerald-600 bg-emerald-50/20">
                                  {(row.productionCompleted || 0).toFixed(2)} KG
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
                                    <div className="flex items-center justify-end gap-2">
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
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenRollModal(
                                        { isInlineEdit: true, orderId: modalOrder.id, subOrderIdx: originalIndex },
                                        `Edit: ${inlineQuality || 'Quality'} - ${inlineSize || 'Size'}`,
                                        parseInt(inlineNoOfRolls, 10) || 0,
                                        inlineRollNumbers
                                      );
                                    }}
                                    className="mt-1 w-full text-[9.5px] font-extrabold text-amber-700 hover:underline flex items-center justify-center gap-1 cursor-pointer bg-amber-50 py-1 rounded border border-amber-200"
                                  >
                                    <Layers size={10} className="text-amber-600" />
                                    <span>Record Rolls ({inlineRollNumbers.length})</span>
                                  </button>
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Target (KG)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={inlineTotalQuantity}
                                    onChange={(e) => setInlineTotalQuantity(e.target.value)}
                                    className="w-full bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black text-right"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] font-black text-zinc-500 uppercase">Completed (KG)</label>
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleOpenRollModal(
                                      { orderId: modalOrder.id, subOrderIdx: originalIndex },
                                      `${row.quality} - ${row.size} (${row.gsm} GSM)`,
                                      row.noOfRolls || 0,
                                      row.rollNumbers || []
                                    );
                                  }}
                                  className="w-full h-full flex flex-col items-center justify-center rounded bg-amber-50/80 hover:bg-amber-100/80 transition-colors cursor-pointer border border-amber-200/50 p-0.5"
                                  title="View & Record Roll Numbers"
                                >
                                  <span className="text-[7.5px] font-extrabold text-amber-700 uppercase block flex items-center justify-center gap-0.5">
                                    <Layers size={9} className="text-amber-600" /> Rolls
                                  </span>
                                  <span className="font-black text-amber-950 font-mono text-xs block">
                                    {row.noOfRolls !== undefined ? `${row.noOfRolls}` : '0'}
                                    {(row.rollNumbers?.length || 0) > 0 && (
                                      <span className="ml-1 bg-amber-600 text-white text-[8px] px-1 py-0.2 rounded-full font-sans font-black">
                                        {row.rollNumbers?.length}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </div>
                            </div>

                            <div className="flex justify-between items-center gap-2 bg-emerald-50/20 border border-emerald-500/10 rounded-xl p-2 text-xs font-mono">
                              <div>
                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-wider block">Target</span>
                                <span className="font-black text-zinc-900">{row.totalQuantity.toFixed(2)} KG</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] text-zinc-400 font-black uppercase tracking-wider block">Completed</span>
                                <span className="font-black text-emerald-600">{(row.productionCompleted || 0).toFixed(2)} KG</span>
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider block mb-1">Weave Quality / Mix <span className="text-amber-600">*</span></label>
                      <input
                        type="text"
                        value={subQuality}
                        onChange={(e) => setSubQuality(e.target.value)}
                        placeholder="e.g. Milky White"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-3 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
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
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Target (KG) <span className="text-amber-600">*</span></label>
                      <input
                        type="number"
                        step="any"
                        value={subTotalQuantity}
                        onChange={(e) => setSubTotalQuantity(e.target.value)}
                        placeholder="e.g. 2.40"
                        className="w-full bg-white border border-zinc-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenRollModal(
                            { isDraftNew: true },
                            `New Sub-Order: ${subQuality || 'Unspecified Quality'} - ${subSize || 'Unspecified Size'}`,
                            parseInt(subNoOfRolls, 10) || 0,
                            subRollNumbers
                          );
                        }}
                        className="mt-1 text-[9.5px] font-extrabold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Layers size={11} className="text-amber-600" />
                        <span>+ Record Roll Numbers ({subRollNumbers.length})</span>
                      </button>
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

                  <div className="flex justify-end pt-3 border-t border-zinc-200/50">
                    <button
                      type="submit"
                      className="w-full md:w-auto md:px-8 bg-zinc-950 hover:bg-zinc-850 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider py-2.5 rounded-xl border border-zinc-800 transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={13} className="stroke-[2.5]" /> Append Sub-order
                    </button>
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

      {/* ========================================================================= */}
      {/* POP-UP WINDOW: SUB-ORDER ROLL NUMBERS MANAGEMENT MODAL                    */}
      {/* ========================================================================= */}
      {isRollModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-3.5 py-3 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Layers size={18} className="sm:hidden" />
                  <Layers size={20} className="hidden sm:block" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 leading-tight">
                    Roll Numbers Directory
                  </h3>
                  <p className="text-[10.5px] sm:text-xs text-zinc-400 font-semibold truncate max-w-[190px] sm:max-w-md">
                    {rollModalTitle || 'Sub-Order Specification Rolls'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRollModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-6">
              
              {/* Summary Stats Banner */}
              {(() => {
                const targetOrderForModal = rollModalContext?.orderId ? orders.find(o => o.id === rollModalContext.orderId) : null;
                const targetSubRowForModal = (targetOrderForModal && rollModalContext?.subOrderIdx !== undefined)
                  ? targetOrderForModal.rows[rollModalContext.subOrderIdx]
                  : null;

                const modalDispatchStatusMap = targetSubRowForModal?.rollDispatchStatus || {};
                const modalDispatchedRollsSet = new Set(targetSubRowForModal?.dispatchedRolls || []);

                const modalNotDispatchedCount = rollNumbersList.filter(
                  r => modalDispatchStatusMap[r] !== 'Dispatched' && !modalDispatchedRollsSet.has(r)
                ).length;
                const modalDispatchedCount = rollNumbersList.filter(
                  r => modalDispatchStatusMap[r] === 'Dispatched' || modalDispatchedRollsSet.has(r)
                ).length;

                return (
                  <div className="bg-zinc-50 border border-zinc-200/90 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3 text-center shadow-3xs">
                    <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 shadow-3xs">
                      <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                        Total Recorded
                      </span>
                      <span className="text-base sm:text-xl font-black text-zinc-900 font-mono mt-0.5 block">
                        {rollNumbersList.length}
                      </span>
                    </div>
                    <div className="bg-white border border-amber-200/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 shadow-3xs">
                      <span className="text-[8px] sm:text-[9px] font-black text-amber-700 uppercase tracking-wider block truncate">
                        Not Dispatched
                      </span>
                      <span className="text-base sm:text-xl font-black text-amber-600 font-mono mt-0.5 block">
                        {modalNotDispatchedCount}
                      </span>
                    </div>
                    <div className="bg-white border border-emerald-200/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 shadow-3xs">
                      <span className="text-[8px] sm:text-[9px] font-black text-emerald-700 uppercase tracking-wider block truncate">
                        Dispatched
                      </span>
                      <span className="text-base sm:text-xl font-black text-emerald-600 font-mono mt-0.5 block">
                        {modalDispatchedCount}
                      </span>
                    </div>
                    <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2.5 shadow-3xs">
                      <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                        Target & Completion
                      </span>
                      <span className="text-base sm:text-xl font-black text-zinc-800 font-mono mt-0.5 block">
                        {rollModalTargetNoOfRolls ? `${rollNumbersList.length}/${rollModalTargetNoOfRolls}` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* RECORD ENTRY SECTION */}
              <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                <div className="flex flex-row justify-between items-center gap-2">
                  <h4 className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                    <PlusCircle size={14} className="text-amber-600 shrink-0" />
                    <span>Record Roll Entry</span>
                  </h4>
                  <div className="flex bg-white border border-zinc-200/90 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsBulkRollMode(false)}
                      className={`px-2.5 py-1 text-[9.5px] sm:text-[10px] font-black rounded-md transition-all cursor-pointer ${
                        !isBulkRollMode ? 'bg-amber-500 text-zinc-950 shadow-3xs' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      Single Roll
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBulkRollMode(true)}
                      className={`px-2.5 py-1 text-[9.5px] sm:text-[10px] font-black rounded-md transition-all cursor-pointer ${
                        isBulkRollMode ? 'bg-amber-500 text-zinc-950 shadow-3xs' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      Bulk Batch
                    </button>
                  </div>
                </div>

                {!isBulkRollMode ? (
                  /* Single Entry Form - Mobile optimized layout */
                  <form onSubmit={handleRecordSingleRollNumber} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newRollInput}
                      onChange={(e) => setNewRollInput(e.target.value)}
                      placeholder="Enter Roll Number (e.g. R-101)..."
                      className="flex-1 min-w-0 bg-white border border-zinc-300 rounded-xl px-3.5 py-2.5 sm:py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-3xs"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 sm:py-2 rounded-xl transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Plus size={14} className="stroke-[3]" />
                      <span>Record Entry</span>
                    </button>
                  </form>
                ) : (
                  /* Bulk Batch Form */
                  <form onSubmit={handleRecordBulkRollNumbers} className="space-y-2">
                    <textarea
                      value={bulkRollInput}
                      onChange={(e) => setBulkRollInput(e.target.value)}
                      rows={3}
                      placeholder="Enter multiple Roll Numbers separated by commas or new lines&#10;Example: R-101, R-102, R-103"
                      className="w-full bg-white border border-zinc-300 rounded-xl p-2.5 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-3xs"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 sm:py-2 rounded-xl transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check size={14} className="stroke-[3]" />
                        <span>Record Batch Entries</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* LIST OF RECORDED ROLL NUMBERS */}
              <div className="border border-zinc-200 rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-3xs flex flex-col">
                {(() => {
                  const targetOrderForModal = rollModalContext?.orderId ? orders.find(o => o.id === rollModalContext.orderId) : null;
                  const targetSubRowForModal = (targetOrderForModal && rollModalContext?.subOrderIdx !== undefined)
                    ? targetOrderForModal.rows[rollModalContext.subOrderIdx]
                    : null;

                  const modalDispatchStatusMap = targetSubRowForModal?.rollDispatchStatus || {};
                  const modalDispatchedRollsSet = new Set(targetSubRowForModal?.dispatchedRolls || []);

                  const notDispatchedList = rollNumbersList.filter(
                    r => modalDispatchStatusMap[r] !== 'Dispatched' && !modalDispatchedRollsSet.has(r)
                  );
                  const dispatchedList = rollNumbersList.filter(
                    r => modalDispatchStatusMap[r] === 'Dispatched' || modalDispatchedRollsSet.has(r)
                  );

                  return (
                    <>
                      <div className="bg-zinc-100 px-3 py-2 sm:px-4 sm:py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-zinc-800 flex items-center gap-1.5 mr-1">
                            <Layers size={13} className="text-amber-600 shrink-0" />
                            <span>Recorded Rolls ({rollNumbersList.length})</span>
                          </span>

                          {/* Filter Pills */}
                          <div className="flex items-center gap-1 bg-zinc-200/80 p-0.5 rounded-lg border border-zinc-300">
                            <button
                              type="button"
                              onClick={() => setRollModalDispatchFilter('all')}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer ${
                                rollModalDispatchFilter === 'all'
                                  ? 'bg-white text-zinc-950 shadow-3xs'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              All ({rollNumbersList.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setRollModalDispatchFilter('not_dispatched')}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                                rollModalDispatchFilter === 'not_dispatched'
                                  ? 'bg-amber-500 text-zinc-950 shadow-3xs'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              <PackageX size={11} />
                              <span>Not Dispatched ({notDispatchedList.length})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRollModalDispatchFilter('dispatched')}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                                rollModalDispatchFilter === 'dispatched'
                                  ? 'bg-emerald-600 text-white shadow-3xs'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              <Truck size={11} />
                              <span>Dispatched ({dispatchedList.length})</span>
                            </button>
                          </div>

                          {/* Quick Batch Dispatch Buttons */}
                          {notDispatchedList.length > 0 && !viewOnly && (
                            <button
                              type="button"
                              onClick={() => handleBulkToggleRollDispatchStatusInModal(rollNumbersList, 'Dispatched')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-3xs cursor-pointer transition-all active:scale-95"
                              title="Mark all rolls in this sub-order as Dispatched"
                            >
                              <Truck size={12} />
                              <span>Mark All Dispatched ({notDispatchedList.length})</span>
                            </button>
                          )}
                          {dispatchedList.length > 0 && notDispatchedList.length === 0 && !viewOnly && (
                            <button
                              type="button"
                              onClick={() => handleBulkToggleRollDispatchStatusInModal(rollNumbersList, 'Not Dispatched')}
                              className="px-2.5 py-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                              title="Reset all rolls to Not Dispatched"
                            >
                              <PackageX size={12} />
                              <span>Reset All to Not Dispatched</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {rollNumbersList.length > 5 && (
                            <div className="relative">
                              <input
                                type="text"
                                value={rollSearchQuery}
                                onChange={(e) => setRollSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-24 sm:w-32 bg-white border border-zinc-300 rounded-lg px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          )}
                          {rollNumbersList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("Are you sure you want to clear all roll numbers from this sub-order?")) {
                                  setRollNumbersList([]);
                                  syncRollNumbersStateAndFirestore([]);
                                  triggerAlert('info', 'Cleared all recorded roll numbers.');
                                }
                              }}
                              className="text-[9.5px] font-black text-rose-600 hover:text-rose-700 hover:underline uppercase tracking-wider cursor-pointer"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                      </div>

                      {rollNumbersList.length === 0 ? (
                        <div className="py-8 sm:py-10 text-center select-none px-4">
                          <FileText className="mx-auto text-zinc-300 mb-2" size={28} />
                          <p className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                            No roll numbers recorded yet
                          </p>
                          <p className="text-[10px] text-zinc-500 max-w-xs mx-auto mt-0.5">
                            Type individual roll numbers above or paste in bulk to maintain precise trackability.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 sm:p-4 max-h-[300px] sm:max-h-[360px] overflow-y-auto space-y-4">
                          {(() => {
                            const query = rollSearchQuery.trim().toLowerCase();
                            const filterBySearch = (list: string[]) => query ? list.filter(r => r.toLowerCase().includes(query)) : list;

                            const visibleNotDispatched = filterBySearch(notDispatchedList);
                            const visibleDispatched = filterBySearch(dispatchedList);

                            const showNotDispatchedSection = (rollModalDispatchFilter === 'all' || rollModalDispatchFilter === 'not_dispatched') && visibleNotDispatched.length > 0;
                            const showDispatchedSection = (rollModalDispatchFilter === 'all' || rollModalDispatchFilter === 'dispatched') && visibleDispatched.length > 0;

                            if (!showNotDispatchedSection && !showDispatchedSection) {
                              return (
                                <div className="py-6 text-center text-xs font-bold text-zinc-400">
                                  No rolls found matching the current filter or search query.
                                </div>
                              );
                            }

                            return (
                              <>
                                {/* SECTION 1: NOT DISPATCHED ROLLS */}
                                {showNotDispatchedSection && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between bg-amber-50/80 px-3 py-1.5 rounded-lg border border-amber-200">
                                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                                        <PackageX size={13} className="text-amber-600" />
                                        <span>Not Dispatched / Recorded Rolls</span>
                                      </span>
                                      <span className="bg-amber-200 text-amber-950 text-[10px] font-mono font-black px-2 py-0.2 rounded-full">
                                        {visibleNotDispatched.length}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      {visibleNotDispatched.map((rollNo) => {
                                        const originalIndex = rollNumbersList.indexOf(rollNo);
                                        return (
                                          <div
                                            key={rollNo}
                                            className="flex items-center justify-between bg-zinc-50 border border-zinc-250 hover:border-amber-300 rounded-xl px-3 py-2 transition-all shadow-3xs group"
                                          >
                                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                              <span className="text-[10px] font-mono font-black text-zinc-400 shrink-0">
                                                #{originalIndex + 1}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleViewRollDetail(rollNo)}
                                                className="text-xs sm:text-sm font-extrabold font-mono text-zinc-900 hover:text-amber-700 hover:underline cursor-pointer flex items-center gap-1.5 transition-colors whitespace-nowrap group/roll"
                                                title={`Click to view Master Roll Ledger details for Roll #${rollNo}`}
                                              >
                                                <span>{rollNo}</span>
                                                <Info size={12} className="text-amber-600 opacity-70 group-hover/roll:opacity-100 shrink-0" />
                                              </button>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <select
                                                value="Not Dispatched"
                                                onChange={(e) => handleToggleRollDispatchStatusInModal(rollNo, e.target.value as 'Dispatched' | 'Not Dispatched')}
                                                disabled={viewOnly}
                                                className="text-xs font-bold bg-white border border-zinc-250 hover:border-amber-400 text-zinc-800 rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-3xs"
                                              >
                                                <option value="Not Dispatched">Not Dispatched</option>
                                                <option value="Dispatched">Dispatched</option>
                                              </select>

                                              <button
                                                type="button"
                                                onClick={() => handleDeleteRollNumber(originalIndex)}
                                                className="text-zinc-400 hover:text-rose-600 active:scale-90 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                                title={`Remove Roll ${rollNo}`}
                                              >
                                                <X size={15} />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* SECTION 2: DISPATCHED ROLLS */}
                                {showDispatchedSection && (
                                  <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                                      <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                                        <Truck size={13} className="text-emerald-600" />
                                        <span>Dispatched Rolls History</span>
                                      </span>
                                      <span className="bg-emerald-200 text-emerald-950 text-[10px] font-mono font-black px-2 py-0.2 rounded-full">
                                        {visibleDispatched.length}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      {visibleDispatched.map((rollNo) => {
                                        const originalIndex = rollNumbersList.indexOf(rollNo);
                                        return (
                                          <div
                                            key={rollNo}
                                            className="flex items-center justify-between bg-emerald-50/70 border border-emerald-300 hover:border-emerald-400 rounded-xl px-3 py-2 transition-all shadow-3xs group"
                                          >
                                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                              <span className="text-[10px] font-mono font-black text-emerald-600 shrink-0">
                                                #{originalIndex + 1}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleViewRollDetail(rollNo)}
                                                className="text-xs sm:text-sm font-extrabold font-mono text-emerald-950 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1.5 transition-colors whitespace-nowrap group/roll"
                                                title={`Click to view Master Roll Ledger details for Roll #${rollNo}`}
                                              >
                                                <span>{rollNo}</span>
                                                <Info size={12} className="text-emerald-700 opacity-80 group-hover/roll:opacity-100 shrink-0" />
                                              </button>
                                              <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider">
                                                DISPATCHED
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <select
                                                value="Dispatched"
                                                onChange={(e) => handleToggleRollDispatchStatusInModal(rollNo, e.target.value as 'Dispatched' | 'Not Dispatched')}
                                                disabled={viewOnly}
                                                className="text-xs font-bold bg-white border border-emerald-400 text-emerald-950 rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-3xs"
                                              >
                                                <option value="Dispatched">Dispatched</option>
                                                <option value="Not Dispatched">Not Dispatched</option>
                                              </select>

                                              <button
                                                type="button"
                                                onClick={() => handleDeleteRollNumber(originalIndex)}
                                                className="text-emerald-700 hover:text-rose-600 active:scale-90 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                                title={`Remove Roll ${rollNo}`}
                                              >
                                                <X size={15} />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-3.5 py-3 sm:px-6 sm:py-3.5 border-t border-zinc-200 flex justify-between items-center shrink-0">
              <span className="text-[10px] sm:text-xs font-bold text-zinc-600 font-mono">
                {rollNumbersList.length} of {rollModalTargetNoOfRolls || '—'} rolls logged
              </span>
              <button
                type="button"
                onClick={() => setIsRollModalOpen(false)}
                className="bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider py-2.5 px-4 sm:px-6 rounded-xl border border-zinc-800 transition-all shadow-3xs cursor-pointer"
              >
                Done / Save Entry
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POP-UP WINDOW: INDIVIDUAL ROLL MASTER LEDGER DETAILS                       */}
      {/* ========================================================================= */}
      {rollDetailModalItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 leading-tight font-mono">
                      Roll #{rollDetailModalItem.rollNo}
                    </h3>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        rollDetailModalItem.dispatchStatus === 'Dispatched'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {rollDetailModalItem.dispatchStatus}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-zinc-400 font-semibold truncate mt-0.5">
                    Master Roll Ledger Record • Order #{rollDetailModalItem.orderNo}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRollDetailModalItem(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Order Context Card */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 grid grid-cols-2 gap-2 text-zinc-800">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Order #</span>
                  <span className="font-extrabold font-mono text-zinc-900">{rollDetailModalItem.orderNo}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Order Date</span>
                  <span className="font-semibold text-zinc-800">{rollDetailModalItem.orderDate || '—'}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-amber-200/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Weave Quality / Variety</span>
                    <span className="font-extrabold text-zinc-900">{rollDetailModalItem.quality || '—'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Size</span>
                    <span className="font-extrabold text-zinc-900">{rollDetailModalItem.size || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Key Measurements & Weights */}
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <Layers size={12} className="text-amber-600" />
                  <span>Roll Specifications & Weights</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-zinc-500 uppercase block">Meters (MTR)</span>
                    <span className="font-mono font-black text-sm text-zinc-900">
                      {rollDetailModalItem.meters ? `${rollDetailModalItem.meters} m` : '—'}
                    </span>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-zinc-500 uppercase block">Gross Weight</span>
                    <span className="font-mono font-black text-sm text-zinc-900">
                      {rollDetailModalItem.grossWt ? `${rollDetailModalItem.grossWt} kg` : '—'}
                    </span>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-zinc-500 uppercase block">Core Weight</span>
                    <span className="font-mono font-black text-sm text-zinc-700">
                      {rollDetailModalItem.coreWt ? `${rollDetailModalItem.coreWt} kg` : '—'}
                    </span>
                  </div>

                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-indigo-900 uppercase block">Net Weight</span>
                    <span className="font-mono font-black text-sm text-indigo-950">
                      {rollDetailModalItem.netWt ? `${rollDetailModalItem.netWt} kg` : '—'}
                    </span>
                  </div>

                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-emerald-900 uppercase block">Avg Weight [calc]</span>
                    <span className="font-mono font-black text-sm text-emerald-950">
                      {rollDetailModalItem.avgWtCalculated ? `${rollDetailModalItem.avgWtCalculated} grams` : '—'}
                    </span>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5">
                    <span className="text-[9.5px] font-bold text-amber-900 uppercase block">GSM [calc]</span>
                    <span className="font-mono font-black text-sm text-amber-950">
                      {(() => {
                        const sz = parseFloat(String(rollDetailModalItem.size || '').replace(/[^0-9.]/g, '')) || 0;
                        const avg = Number(rollDetailModalItem.avgWtCalculated) || 0;
                        return (sz > 0 && avg > 0) ? `${(avg / sz).toFixed(2)}` : '—';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="border-t border-zinc-100 pt-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">
                  Technical Fabric Specs
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-zinc-800 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Target GSM</span>
                    <span className="font-mono font-bold">{rollDetailModalItem.gsm || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Target Avg Weight</span>
                    <span className="font-mono font-bold">
                      {rollDetailModalItem.fabricWeight ? `${rollDetailModalItem.fabricWeight} grams` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Denier</span>
                    <span className="font-mono font-bold">{rollDetailModalItem.denier || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Strength</span>
                    <span className="font-mono font-bold">{rollDetailModalItem.strength || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Elongation</span>
                    <span className="font-mono font-bold">
                      {rollDetailModalItem.elongation ? `${rollDetailModalItem.elongation}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {rollDetailModalItem.remarks && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                  <span className="text-[9.5px] font-bold text-zinc-500 uppercase block mb-0.5">Remarks</span>
                  <p className="text-zinc-800 font-medium italic text-[11px]">{rollDetailModalItem.remarks}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-zinc-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setRollDetailModalItem(null)}
                className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 font-black text-xs uppercase tracking-wider py-2 px-5 rounded-xl border border-zinc-800 transition-all cursor-pointer shadow-3xs"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* POP-UP WINDOW: DUPLICATE ROLL NUMBERS AUDIT MODAL */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-3.5 py-3 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border flex items-center justify-center shrink-0 ${
                  rollAuditResults.duplicatesCount > 0 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}>
                  <ShieldAlert size={20} className="hidden sm:block" />
                  <ShieldAlert size={18} className="sm:hidden" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 leading-tight">
                    Roll Numbers Audit Directory
                  </h3>
                  <p className="text-[10.5px] sm:text-xs text-zinc-400 font-semibold truncate max-w-[200px] sm:max-w-md">
                    Multi-Order Roll Integrity & Duplicate Checker
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDuplicateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3 sm:p-6 overflow-y-auto space-y-4">
              
              {/* Stat Overview Banner */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shadow-3xs">
                <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-2 shadow-3xs">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                    Orders Scanned
                  </span>
                  <span className="text-base sm:text-xl font-black text-zinc-800 font-mono mt-0.5 block">
                    {rollAuditResults.totalOrdersScanned}
                  </span>
                </div>
                <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-2 shadow-3xs">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                    Sub-Orders
                  </span>
                  <span className="text-base sm:text-xl font-black text-zinc-800 font-mono mt-0.5 block">
                    {rollAuditResults.totalSubOrdersScanned}
                  </span>
                </div>
                <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-2 shadow-3xs">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                    Total Rolls Logged
                  </span>
                  <span className="text-base sm:text-xl font-black text-amber-600 font-mono mt-0.5 block">
                    {rollAuditResults.totalRollsRecorded}
                  </span>
                </div>
                <div className="bg-white border border-zinc-200/80 rounded-lg sm:rounded-xl p-2 shadow-3xs">
                  <span className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase tracking-wider block truncate">
                    Duplicate Status
                  </span>
                  <span className={`text-base sm:text-xl font-black font-mono mt-0.5 block ${
                    rollAuditResults.duplicatesCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}>
                    {rollAuditResults.duplicatesCount > 0 ? `${rollAuditResults.duplicatesCount} Duplicates` : '0 Duplicates'}
                  </span>
                </div>
              </div>

              {/* IF NO DUPLICATES FOUND */}
              {rollAuditResults.duplicatesCount === 0 ? (
                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-emerald-950 uppercase tracking-tight">
                      No Duplicate Roll Numbers Found!
                    </h4>
                    <p className="text-xs sm:text-sm font-medium text-emerald-800 max-w-lg mx-auto mt-1 leading-relaxed">
                      All <strong className="font-mono font-bold text-emerald-950">{rollAuditResults.totalRollsRecorded}</strong> recorded roll numbers across <strong className="font-mono font-bold text-emerald-950">{rollAuditResults.totalOrdersScanned}</strong> orders and <strong className="font-mono font-bold text-emerald-950">{rollAuditResults.totalSubOrdersScanned}</strong> sub-orders are completely unique.
                    </p>
                  </div>
                  <div className="bg-white/80 border border-emerald-200/60 rounded-xl p-3 text-[11px] font-semibold text-emerald-900 max-w-md mx-auto">
                    ✨ Every recorded roll number is distinct and uniquely tracked across your entire PP Fabric database.
                  </div>
                </div>
              ) : (
                /* IF DUPLICATES ARE FOUND */
                <div className="space-y-3">
                  {/* Alert message banner */}
                  <div className="bg-rose-50 border border-rose-200/90 rounded-xl p-3 flex items-start gap-2.5">
                    <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-950 leading-snug">
                      <span className="font-black uppercase tracking-wider block mb-0.5">
                        Attention Required: Duplicate Roll Entries Detected
                      </span>
                      Found <strong className="font-mono font-bold">{rollAuditResults.duplicatesCount}</strong> duplicate roll number key(s) logged across multiple entries. Click "Manage Order" on any entry below to open that sub-order and correct or remove the duplicate roll number.
                    </div>
                  </div>

                  {/* Filter search input for duplicate list if there are many */}
                  {rollAuditResults.duplicatesCount > 3 && (
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={duplicateSearchQuery}
                        onChange={(e) => setDuplicateSearchQuery(e.target.value)}
                        placeholder="Filter duplicate roll numbers..."
                        className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  )}

                  {/* List of Duplicate Roll Groups */}
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {rollAuditResults.duplicates
                      .filter(d => !duplicateSearchQuery.trim() || d.rollNo.toLowerCase().includes(duplicateSearchQuery.trim().toLowerCase()))
                      .map((dup, dIdx) => (
                        <div key={dIdx} className="bg-white border-2 border-rose-200/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm space-y-2.5">
                          
                          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-rose-100">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-rose-600 text-white text-xs sm:text-sm font-black font-mono rounded-lg shadow-3xs">
                                Roll #: {dup.rollNo}
                              </span>
                              <span className="text-[10.5px] sm:text-xs font-bold text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200">
                                Found in {dup.count} entries
                              </span>
                            </div>
                          </div>

                          {/* List of locations */}
                          <div className="space-y-2 pt-0.5">
                            {dup.occurrences.map((occ, oIdx) => (
                              <div
                                key={oIdx}
                                className="bg-zinc-50 border border-zinc-200/80 hover:border-amber-300 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all"
                              >
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9.5px] font-mono font-bold text-zinc-400">
                                      Location #{oIdx + 1}
                                    </span>
                                    <span className="font-mono font-black text-xs text-zinc-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300/80">
                                      Order: {occ.orderNo}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 font-medium">
                                      ({occ.orderDate})
                                    </span>
                                  </div>
                                  <div className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-amber-800 font-bold">Sub-Order #{occ.subOrderIdx}:</span>
                                    <span>{occ.quality}</span>
                                    <span className="text-zinc-400">•</span>
                                    <span>{occ.size}</span>
                                    {occ.gsm && (
                                      <>
                                        <span className="text-zinc-400">•</span>
                                        <span className="font-mono text-zinc-600">{occ.gsm} GSM</span>
                                      </>
                                    )}
                                    {occ.laminationType && (
                                      <span className="text-[10px] bg-zinc-200/80 text-zinc-700 px-1.5 py-0.2 rounded uppercase font-extrabold">
                                        {occ.laminationType}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsDuplicateModalOpen(false);
                                    setActiveModalOrderId(occ.orderId);
                                  }}
                                  className="self-end sm:self-auto bg-amber-500 hover:bg-amber-600 active:scale-95 text-zinc-950 text-[10.5px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-600 shadow-3xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                                >
                                  <span>Manage Order</span>
                                  <ArrowRight size={12} className="stroke-[3]" />
                                </button>
                              </div>
                            ))}
                          </div>

                        </div>
                      ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-3.5 py-3 sm:px-6 sm:py-3.5 border-t border-zinc-200 flex justify-between items-center shrink-0">
              <span className="text-[10px] sm:text-xs font-bold text-zinc-500 font-mono">
                {rollAuditResults.duplicatesCount === 0 
                  ? `${rollAuditResults.totalRollsRecorded} rolls verified unique` 
                  : `${rollAuditResults.duplicatesCount} duplicate issue(s) flagged`}
              </span>
              <button
                type="button"
                onClick={() => setIsDuplicateModalOpen(false)}
                className="bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider py-2.5 px-5 sm:px-6 rounded-xl border border-zinc-800 transition-all shadow-3xs cursor-pointer"
              >
                Close Audit Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* POP-UP WINDOW: MASTER ROLL LEDGER DIRECTORY MODAL */}
      {isMasterLedgerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-1.5 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-[98vw] 2xl:max-w-[1920px] shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[93vh]">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-3.5 py-3 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <BookOpen size={20} className="hidden sm:block" />
                  <BookOpen size={18} className="sm:hidden" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 leading-tight flex items-center gap-2">
                    <span>Master Roll Ledger Directory</span>
                    <span className="bg-amber-400/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono border border-amber-400/30 font-bold">
                      {masterRollLedgerData.length} Rolls
                    </span>
                  </h3>
                  <p className="text-[10.5px] sm:text-xs text-zinc-400 font-semibold truncate max-w-[200px] sm:max-w-md">
                    All-in-one unified roll registry across all orders & sub-orders
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMasterLedgerOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Controls Bar */}
            <div className="bg-zinc-50 border-b border-zinc-200 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={masterLedgerSearchQuery}
                  onChange={(e) => setMasterLedgerSearchQuery(e.target.value)}
                  placeholder="Search by Roll No, Size, GSM, Quality, Order No, Dispatch Status, or Remarks..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-3xs"
                />
                {masterLedgerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMasterLedgerSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Action Buttons & Dispatch Filters */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {/* Dispatch Status Filter Tabs */}
                <div className="flex items-center gap-1 bg-zinc-200/80 p-1 rounded-xl border border-zinc-300">
                  <button
                    type="button"
                    onClick={() => setMasterLedgerDispatchFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                      masterLedgerDispatchFilter === 'all'
                        ? 'bg-white text-zinc-950 shadow-3xs border border-zinc-250'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span>All Rolls</span>
                    <span className="bg-zinc-200 text-zinc-800 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                      {masterRollLedgerData.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMasterLedgerDispatchFilter('not_dispatched')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                      masterLedgerDispatchFilter === 'not_dispatched'
                        ? 'bg-amber-500 text-zinc-950 shadow-3xs border border-amber-600'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <PackageX size={12} className="text-amber-900" />
                    <span>Not Dispatched</span>
                    <span className="bg-amber-100 text-amber-950 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                      {masterRollLedgerData.filter(i => i.dispatchStatus === 'Not Dispatched').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMasterLedgerDispatchFilter('dispatched')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                      masterLedgerDispatchFilter === 'dispatched'
                        ? 'bg-emerald-600 text-white shadow-3xs border border-emerald-700'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Truck size={12} className="text-emerald-300" />
                    <span>Dispatched</span>
                    <span className="bg-emerald-800 text-emerald-100 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                      {masterRollLedgerData.filter(i => i.dispatchStatus === 'Dispatched').length}
                    </span>
                  </button>
                </div>

                {!viewOnly && (
                  <button
                    type="button"
                    onClick={() => setIsAddingRollInLedger(!isAddingRollInLedger)}
                    className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-wider px-3.5 py-2 rounded-xl border border-amber-600 shadow-3xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>{isAddingRollInLedger ? 'Close Add' : 'Add Roll'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMasterLedgerExportOption('dispatched');
                    setIsMasterLedgerExportModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-3 py-2 rounded-xl border border-emerald-700 shadow-3xs flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Export Master Ledger to Excel"
                >
                  <FileSpreadsheet size={15} />
                  <span className="hidden sm:inline">Export Excel</span>
                </button>
              </div>

            </div>

            {/* Quick Add Roll Form Panel (Collapsible) */}
            {isAddingRollInLedger && !viewOnly && (
              <form onSubmit={handleAddMasterRollDirectly} className="bg-amber-50/90 border-b border-amber-200 p-3.5 sm:p-4 space-y-3 shrink-0 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <PlusCircle size={15} className="text-amber-600" />
                    Quick Add Roll to Sub-Order Registry
                  </span>
                  <span className="text-[10.5px] font-semibold text-amber-800">
                    Will auto-inherit specs & sort ascending
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block mb-1">
                      Select Target Order & Sub-Order
                    </label>
                    <select
                      value={`${ledgerAddOrderId}___${ledgerAddSubOrderIdx}`}
                      onChange={(e) => {
                        const [oId, subIdxStr] = e.target.value.split('___');
                        setLedgerAddOrderId(oId || '');
                        setLedgerAddSubOrderIdx(Number(subIdxStr) || 0);
                      }}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    >
                      <option value="">-- Choose Order & Sub-Order --</option>
                      {orders.map(o => 
                        (o.rows || []).map((r, subIdx) => (
                          <option key={`${o.id}_${subIdx}`} value={`${o.id}___${subIdx}`}>
                            Order #{o.orderNo} ({o.date}) — Sub #{subIdx + 1}: {r.quality || 'N/A'} [{r.size || 'N/A'}]
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block mb-1">
                      New Roll Number
                    </label>
                    <input
                      type="text"
                      value={ledgerAddRollNo}
                      onChange={(e) => setLedgerAddRollNo(e.target.value)}
                      placeholder="e.g. R-101 or RN-205"
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 uppercase placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div className="sm:col-span-3 flex items-end">
                    <button
                      type="submit"
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider py-2 rounded-xl shadow-3xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Add Roll</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Modal Body: Ledger Table / Cards */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-4">
              
              {masterRollLedgerData.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-8 text-center space-y-2">
                  <BookOpen size={36} className="mx-auto text-zinc-300" />
                  <h4 className="text-sm font-black text-zinc-700 uppercase tracking-wider">
                    No Roll Numbers Recorded Yet
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto">
                    Roll numbers generated or assigned in sub-orders will automatically appear here in this master roll ledger sorted ascending.
                  </p>
                </div>
              ) : (
                <>
                  {/* Sorting Notice Banner */}
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl px-3.5 py-2 flex items-center justify-between text-[11px] text-amber-900 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Table size={14} className="text-amber-700 shrink-0" />
                      <span>
                        Sorted by <strong className="text-amber-950 font-bold">{getSortColumnLabel(masterLedgerSortKey)}</strong> ({masterLedgerSortOrder === 'asc' ? 'Ascending ⬆' : 'Descending ⬇'}). Click any column header to sort.
                      </span>
                    </div>
                    <span className="font-mono text-[10.5px] font-bold text-amber-800 hidden sm:inline">
                      Showing {masterRollLedgerData.filter(i => {
                        if (!masterLedgerSearchQuery.trim()) return true;
                        const q = masterLedgerSearchQuery.toLowerCase().trim();
                        return (
                          i.rollNo.toLowerCase().includes(q) ||
                          i.size.toLowerCase().includes(q) ||
                          i.quality.toLowerCase().includes(q) ||
                          i.orderNo.toLowerCase().includes(q) ||
                          i.remarks.toLowerCase().includes(q) ||
                          String(i.gsm).includes(q) ||
                          String(i.denier).includes(q) ||
                          String(i.strength).toLowerCase().includes(q) ||
                          String(i.elongation).toLowerCase().includes(q)
                        );
                      }).length} of {masterRollLedgerData.length} rolls
                    </span>
                  </div>

                  {/* DESKTOP / TABLET RESPONSIVE TABLE VIEW */}
                  <div className="hidden sm:block overflow-auto max-h-[65vh] rounded-2xl border border-zinc-200 shadow-3xs bg-white">
                    <table className="w-full text-left border-collapse min-w-[1000px] xl:min-w-0 text-xs">
                      <thead className="sticky top-0 z-20 bg-zinc-900 shadow-xs">
                        <tr className="bg-zinc-900 text-white text-[10px] font-black uppercase tracking-wider border-b border-zinc-800">
                          {/* 1. Roll Number */}
                          <th
                            onClick={() => handleMasterLedgerSort('rollNo')}
                            className={`py-2.5 px-2.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 font-mono text-yellow-400 ${
                              masterLedgerSortKey === 'rollNo' ? 'bg-zinc-800' : ''
                            }`}
                            title="Click to sort by Roll Number"
                          >
                            <div className="flex items-center gap-1">
                              <span>Roll Number</span>
                              {masterLedgerSortKey === 'rollNo' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 2. Size */}
                          <th
                            onClick={() => handleMasterLedgerSort('size')}
                            className={`py-2.5 px-2 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'size' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Size"
                          >
                            <div className="flex items-center gap-1">
                              <span>Size</span>
                              {masterLedgerSortKey === 'size' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 3. GSM */}
                          <th
                            onClick={() => handleMasterLedgerSort('gsm')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'gsm' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by GSM"
                          >
                            <div className="flex items-center gap-1">
                              <span>GSM</span>
                              {masterLedgerSortKey === 'gsm' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 4. Denier */}
                          <th
                            onClick={() => handleMasterLedgerSort('denier')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'denier' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Denier"
                          >
                            <div className="flex items-center gap-1">
                              <span>Denier</span>
                              {masterLedgerSortKey === 'denier' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 5. AVG WT */}
                          <th
                            onClick={() => handleMasterLedgerSort('fabricWeight')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'fabricWeight' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by AVG WT"
                          >
                            <div className="flex items-center gap-1">
                              <span>AVG WT</span>
                              {masterLedgerSortKey === 'fabricWeight' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Gross Weight (kg) */}
                          <th
                            onClick={() => handleMasterLedgerSort('grossWt')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'grossWt' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Gross Weight"
                          >
                            <div className="flex items-center gap-1">
                              <span>Gross Wt</span>
                              {masterLedgerSortKey === 'grossWt' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Core Weight (kg) */}
                          <th
                            onClick={() => handleMasterLedgerSort('coreWt')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'coreWt' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Core Weight"
                          >
                            <div className="flex items-center gap-1">
                              <span>Core Wt</span>
                              {masterLedgerSortKey === 'coreWt' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Net Weight (kg) */}
                          <th
                            onClick={() => handleMasterLedgerSort('netWt')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'netWt' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Net Weight"
                          >
                            <div className="flex items-center gap-1">
                              <span>Net Wt</span>
                              {masterLedgerSortKey === 'netWt' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Average Weight (calc) (grams) */}
                          <th
                            onClick={() => handleMasterLedgerSort('avgWtCalculated')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'avgWtCalculated' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Average Weight (calc)"
                          >
                            <div className="flex items-center gap-1">
                              <span>Avg Wt [calc] (grams)</span>
                              {masterLedgerSortKey === 'avgWtCalculated' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* GSM [CALC] */}
                          <th
                            onClick={() => handleMasterLedgerSort('gsmCalculated')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'gsmCalculated' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by GSM [CALC] (AVG WT [CALC] / SIZE)"
                          >
                            <div className="flex items-center gap-1">
                              <span>GSM [CALC]</span>
                              {masterLedgerSortKey === 'gsmCalculated' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Meters */}
                          <th
                            onClick={() => handleMasterLedgerSort('meters')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'meters' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Meters"
                          >
                            <div className="flex items-center gap-1">
                              <span>Meters</span>
                              {masterLedgerSortKey === 'meters' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Strength */}
                          <th
                            onClick={() => handleMasterLedgerSort('strength')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'strength' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Strength"
                          >
                            <div className="flex items-center gap-1">
                              <span>Strength</span>
                              {masterLedgerSortKey === 'strength' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* Elongation (%) */}
                          <th
                            onClick={() => handleMasterLedgerSort('elongation')}
                            className={`py-2.5 px-1.5 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'elongation' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Elongation (%)"
                          >
                            <div className="flex items-center gap-1">
                              <span>Elongation (%)</span>
                              {masterLedgerSortKey === 'elongation' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 6. Weave Quality */}
                          <th
                            onClick={() => handleMasterLedgerSort('quality')}
                            className={`py-2.5 px-2 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'quality' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Weave Quality"
                          >
                            <div className="flex items-center gap-1">
                              <span>Quality</span>
                              {masterLedgerSortKey === 'quality' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 7. Dispatch Status */}
                          <th
                            onClick={() => handleMasterLedgerSort('dispatchStatus')}
                            className={`py-2.5 px-2 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'dispatchStatus' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Dispatch Status"
                          >
                            <div className="flex items-center gap-1">
                              <span>Dispatch Status</span>
                              {masterLedgerSortKey === 'dispatchStatus' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 8. Remarks */}
                          <th
                            onClick={() => handleMasterLedgerSort('remarks')}
                            className={`py-2.5 px-2 cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'remarks' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Remarks"
                          >
                            <div className="flex items-center gap-1">
                              <span>Remarks</span>
                              {masterLedgerSortKey === 'remarks' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-yellow-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>

                          {/* 9. Order Ref & Actions */}
                          <th
                            onClick={() => handleMasterLedgerSort('orderNo')}
                            className={`py-2.5 px-2.5 text-right cursor-pointer select-none transition-colors hover:bg-zinc-800 ${
                              masterLedgerSortKey === 'orderNo' ? 'text-yellow-400 bg-zinc-800' : 'text-white'
                            }`}
                            title="Click to sort by Order Ref"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Order Ref & Actions</span>
                              {masterLedgerSortKey === 'orderNo' ? (
                                masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} className="text-amber-400 shrink-0 stroke-[2.5]" /> : <ArrowDown size={12} className="text-amber-400 shrink-0 stroke-[2.5]" />
                              ) : (
                                <ArrowUpDown size={11} className="text-zinc-500 hover:text-zinc-300 shrink-0 opacity-70" />
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs">
                        {masterRollLedgerData
                          .filter(item => {
                            // Filter by Dispatch Status tab
                            if (masterLedgerDispatchFilter === 'not_dispatched' && item.dispatchStatus !== 'Not Dispatched') {
                              return false;
                            }
                            if (masterLedgerDispatchFilter === 'dispatched' && item.dispatchStatus !== 'Dispatched') {
                              return false;
                            }

                            if (!masterLedgerSearchQuery.trim()) return true;
                            const q = masterLedgerSearchQuery.toLowerCase().trim();
                            return (
                              item.rollNo.toLowerCase().includes(q) ||
                              item.size.toLowerCase().includes(q) ||
                              item.quality.toLowerCase().includes(q) ||
                              item.orderNo.toLowerCase().includes(q) ||
                              item.remarks.toLowerCase().includes(q) ||
                              item.dispatchStatus.toLowerCase().includes(q) ||
                              String(item.gsm).includes(q) ||
                              String(item.denier).includes(q) ||
                              String(item.grossWt).includes(q) ||
                              String(item.coreWt).includes(q) ||
                              String(item.netWt).includes(q) ||
                              String(item.avgWtCalculated).includes(q) ||
                              (() => {
                                const szVal = parseFloat(String(item.size || '').replace(/[^0-9.]/g, '')) || 0;
                                const avgVal = Number(item.avgWtCalculated) || 0;
                                const gsmCalcStr = (szVal > 0 && avgVal > 0) ? (avgVal / szVal).toFixed(2) : '';
                                return gsmCalcStr.includes(q);
                              })() ||
                              String(item.meters).includes(q) ||
                              String(item.strength).toLowerCase().includes(q) ||
                              String(item.elongation).toLowerCase().includes(q)
                            );
                          })
                          .map((item) => {
                            const isEditing = editingMasterRollId === item.id;

                            if (isEditing) {
                              return (
                                <tr key={item.id} className="bg-amber-50/90 border-2 border-amber-400 animate-fade-in">
                                  {/* Col 1: Roll Number */}
                                  <td className="py-2.5 px-3">
                                    <input
                                      type="text"
                                      value={masterEditRollNo}
                                      onChange={(e) => setMasterEditRollNo(e.target.value)}
                                      className="w-28 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-black text-amber-950 uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Roll #"
                                    />
                                  </td>
                                  {/* Col 2: Size */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="text"
                                      value={masterEditSize}
                                      onChange={(e) => setMasterEditSize(e.target.value)}
                                      className="w-24 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Size"
                                    />
                                  </td>
                                  {/* Col 3: GSM */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      value={masterEditGsm}
                                      onChange={(e) => setMasterEditGsm(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="GSM"
                                    />
                                  </td>
                                  {/* Col 4: Denier */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      value={masterEditDenier}
                                      onChange={(e) => setMasterEditDenier(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Denier"
                                    />
                                  </td>
                                  {/* Col 5: Fabric Weight */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={masterEditFabricWeight}
                                      onChange={(e) => setMasterEditFabricWeight(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Weight"
                                    />
                                  </td>
                                  {/* Gross Weight (kg) */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={masterEditGrossWt}
                                      onChange={(e) => handleMasterEditGrossChange(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Gross Wt"
                                    />
                                  </td>
                                  {/* Core Weight (kg) */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={masterEditCoreWt}
                                      onChange={(e) => handleMasterEditCoreChange(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Core Wt"
                                    />
                                  </td>
                                  {/* Net Weight (kg) */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={masterEditNetWt}
                                      onChange={(e) => handleMasterEditNetChange(e.target.value)}
                                      className="w-20 bg-indigo-50 border border-indigo-400 rounded-lg px-2 py-1 text-xs font-mono font-black text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      placeholder="Net Wt"
                                    />
                                  </td>
                                  {/* Average Weight (calc) (grams) */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="0.0001"
                                      value={masterEditAvgWtCalculated}
                                      onChange={(e) => setMasterEditAvgWtCalculated(e.target.value)}
                                      className="w-24 bg-emerald-50 border border-emerald-400 rounded-lg px-2 py-1 text-xs font-mono font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                      placeholder="Avg Calc"
                                    />
                                  </td>
                                  {/* GSM [CALC] */}
                                  <td className="py-2.5 px-2">
                                    {(() => {
                                      const sz = parseFloat(String(masterEditSize || '').replace(/[^0-9.]/g, '')) || 0;
                                      const avg = parseFloat(masterEditAvgWtCalculated) || 0;
                                      const gCalc = (sz > 0 && avg > 0) ? (avg / sz).toFixed(2) : '-';
                                      return (
                                        <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded block text-center min-w-[60px]">
                                          {gCalc}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  {/* Meters */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="number"
                                      step="1"
                                      value={masterEditMeters}
                                      onChange={(e) => handleMasterEditMetersChange(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Meters"
                                    />
                                  </td>
                                  {/* Strength */}
                                  <td className="py-2.5 px-1.5">
                                    <input
                                      type="text"
                                      value={masterEditStrength}
                                      onChange={(e) => setMasterEditStrength(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Strength"
                                    />
                                  </td>
                                  {/* Elongation (%) */}
                                  <td className="py-2.5 px-1.5">
                                    <input
                                      type="text"
                                      value={masterEditElongation}
                                      onChange={(e) => setMasterEditElongation(e.target.value)}
                                      className="w-20 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Elongation %"
                                    />
                                  </td>
                                  {/* Col 11: Weave Quality */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="text"
                                      value={masterEditQuality}
                                      onChange={(e) => setMasterEditQuality(e.target.value)}
                                      className="w-28 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Quality"
                                    />
                                  </td>
                                  {/* Col 12: Dispatch Status */}
                                  <td className="py-2.5 px-2">
                                    <select
                                      value={masterEditDispatchStatus}
                                      onChange={(e) => setMasterEditDispatchStatus(e.target.value as 'Dispatched' | 'Not Dispatched')}
                                      className="w-32 bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-black text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                      <option value="Not Dispatched">Not Dispatched</option>
                                      <option value="Dispatched">Dispatched</option>
                                    </select>
                                  </td>
                                  {/* Col 13: Remarks */}
                                  <td className="py-2.5 px-2">
                                    <input
                                      type="text"
                                      value={masterEditRemarks}
                                      onChange={(e) => setMasterEditRemarks(e.target.value)}
                                      className="w-full min-w-[120px] bg-white border border-amber-500 rounded-lg px-2 py-1 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      placeholder="Remarks..."
                                    />
                                  </td>
                                  {/* Col 14: Actions */}
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveMasterRollEdit(item)}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-3xs transition-all cursor-pointer"
                                        title="Save roll details"
                                      >
                                        <Check size={13} className="stroke-[3]" />
                                        <span>Save</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelEditMasterRoll}
                                        className="bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-[11px] px-2 py-1 rounded-lg transition-all cursor-pointer"
                                        title="Cancel edit"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                                {/* 1. Roll Number */}
                                <td className="py-2.5 px-3.5 font-mono">
                                  <span className="bg-amber-100 text-amber-950 font-black px-2.5 py-1 rounded-lg border border-amber-300/80 text-xs inline-block shadow-3xs">
                                    {item.rollNo}
                                  </span>
                                </td>
                                {/* 2. Size */}
                                <td className="py-2.5 px-3 font-semibold text-zinc-800">
                                  {item.size || <span className="text-zinc-300 italic">-</span>}
                                </td>
                                {/* 3. GSM */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-700">
                                  {item.gsm ? `${item.gsm}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 4. Denier */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-700">
                                  {item.denier ? `${item.denier}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 5. Fabric Weight */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-700">
                                  {item.fabricWeight ? `${item.fabricWeight}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 6. Gross Weight */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-800">
                                  {item.grossWt ? `${item.grossWt}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 7. Core Weight */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-600">
                                  {item.coreWt ? `${item.coreWt}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 8. Net Weight */}
                                <td className="py-2.5 px-3 font-mono font-black text-indigo-900">
                                  {item.netWt ? `${item.netWt}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 9. Average Weight (calc) */}
                                <td className="py-2.5 px-3 font-mono font-black text-emerald-800">
                                  {item.avgWtCalculated ? `${item.avgWtCalculated}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* GSM [CALC] */}
                                <td className="py-2.5 px-3 font-mono font-black text-amber-900">
                                  {(() => {
                                    const sz = parseFloat(String(item.size || '').replace(/[^0-9.]/g, '')) || 0;
                                    const avg = Number(item.avgWtCalculated) || 0;
                                    return (sz > 0 && avg > 0) ? (avg / sz).toFixed(2) : <span className="text-zinc-300 font-normal italic">-</span>;
                                  })()}
                                </td>
                                {/* 10. Meters */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-800">
                                  {item.meters ? `${item.meters}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* Strength */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-800">
                                  {item.strength ? `${item.strength}` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* Elongation (%) */}
                                <td className="py-2.5 px-3 font-mono font-bold text-zinc-800">
                                  {item.elongation ? `${item.elongation}%` : <span className="text-zinc-300 font-normal italic">-</span>}
                                </td>
                                {/* 11. Weave Quality */}
                                <td className="py-2.5 px-3 font-semibold text-zinc-900">
                                  {item.quality || <span className="text-zinc-300 italic">-</span>}
                                </td>
                                {/* 12. Dispatch Status Dropdown */}
                                <td className="py-2.5 px-3">
                                  <select
                                    value={item.dispatchStatus}
                                    onChange={(e) => handleUpdateRollDispatchStatus(item, e.target.value as 'Dispatched' | 'Not Dispatched')}
                                    disabled={viewOnly}
                                    className={`text-xs font-black px-2.5 py-1 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 ${
                                      item.dispatchStatus === 'Dispatched'
                                        ? 'bg-emerald-100 text-emerald-950 border-emerald-300 focus:ring-emerald-500 shadow-3xs'
                                        : 'bg-zinc-100 text-zinc-700 border-zinc-250 hover:border-amber-400 focus:ring-amber-500'
                                    }`}
                                  >
                                    <option value="Not Dispatched">Not Dispatched</option>
                                    <option value="Dispatched">Dispatched</option>
                                  </select>
                                </td>
                                {/* 13. Remarks */}
                                <td className="py-2.5 px-3 text-zinc-600 text-xs max-w-[150px] truncate">
                                  {item.remarks ? (
                                    <span className="font-medium">{item.remarks}</span>
                                  ) : (
                                    <span className="text-zinc-300 italic text-[11px]">No remarks</span>
                                  )}
                                </td>
                                {/* 14. Order Ref & Actions */}
                                <td className="py-2.5 px-3.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <span className="bg-zinc-100 text-zinc-600 font-mono font-bold text-[10px] px-2 py-0.5 rounded border border-zinc-200">
                                      Ord #{item.orderNo} (Sub #{item.subOrderIdx + 1})
                                    </span>
                                    {!viewOnly && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditMasterRoll(item)}
                                          className="p-1.5 text-zinc-500 hover:text-amber-600 hover:bg-amber-100/60 rounded-lg transition-all cursor-pointer"
                                          title="Edit roll details"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteMasterRoll(item)}
                                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                          title="Delete roll"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* MOBILE OPTIMIZED CARD VIEW (For Small Screens) */}
                  <div className="sm:hidden space-y-3">
                    {/* Mobile Sorting Controls */}
                    <div className="flex items-center justify-between gap-2 bg-zinc-100 p-2 rounded-xl text-xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 font-bold">
                        <SlidersHorizontal size={13} className="text-amber-600" />
                        <span>Sort:</span>
                        <select
                          value={masterLedgerSortKey}
                          onChange={(e) => {
                            setMasterLedgerSortKey(e.target.value as MasterLedgerSortKey);
                            setMasterLedgerSortOrder('asc');
                          }}
                          className="bg-white border border-zinc-300 rounded-lg px-2 py-1 font-bold text-zinc-800 text-[11px]"
                        >
                          <option value="rollNo">Roll Number</option>
                          <option value="size">Size</option>
                          <option value="gsm">GSM</option>
                          <option value="denier">Denier</option>
                          <option value="fabricWeight">AVG WT</option>
                          <option value="grossWt">Gross Weight</option>
                          <option value="coreWt">Core Weight</option>
                          <option value="netWt">Net Weight</option>
                          <option value="avgWtCalculated">Avg Weight (calc)</option>
                          <option value="gsmCalculated">GSM [calc]</option>
                          <option value="meters">Meters</option>
                          <option value="quality">Weave Quality</option>
                          <option value="dispatchStatus">Dispatch Status</option>
                          <option value="remarks">Remarks</option>
                          <option value="orderNo">Order Ref</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMasterLedgerSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                        className="bg-white border border-zinc-300 rounded-lg px-2.5 py-1 font-bold text-amber-700 flex items-center gap-1 text-[11px] shadow-3xs cursor-pointer"
                      >
                        {masterLedgerSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        <span>{masterLedgerSortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
                      </button>
                    </div>
                    {masterRollLedgerData
                      .filter(item => {
                        if (masterLedgerDispatchFilter === 'not_dispatched' && item.dispatchStatus !== 'Not Dispatched') {
                          return false;
                        }
                        if (masterLedgerDispatchFilter === 'dispatched' && item.dispatchStatus !== 'Dispatched') {
                          return false;
                        }

                        if (!masterLedgerSearchQuery.trim()) return true;
                        const q = masterLedgerSearchQuery.toLowerCase().trim();
                        return (
                          item.rollNo.toLowerCase().includes(q) ||
                          item.size.toLowerCase().includes(q) ||
                          item.quality.toLowerCase().includes(q) ||
                          item.orderNo.toLowerCase().includes(q) ||
                          item.remarks.toLowerCase().includes(q) ||
                          item.dispatchStatus.toLowerCase().includes(q) ||
                          String(item.gsm).includes(q) ||
                          String(item.denier).includes(q) ||
                          String(item.grossWt).includes(q) ||
                          String(item.coreWt).includes(q) ||
                          String(item.netWt).includes(q) ||
                          String(item.avgWtCalculated).includes(q) ||
                          String(item.meters).includes(q)
                        );
                      })
                      .map((item) => {
                        const isEditing = editingMasterRollId === item.id;

                        if (isEditing) {
                          return (
                            <div key={item.id} className="bg-amber-50 border-2 border-amber-500 rounded-xl p-3 space-y-2 shadow-sm animate-fade-in">
                              <div className="flex justify-between items-center pb-2 border-b border-amber-200">
                                <span className="text-[10px] font-black text-amber-900 uppercase">
                                  Editing Roll Details
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  Order #{item.orderNo}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Roll Number</label>
                                  <input
                                    type="text"
                                    value={masterEditRollNo}
                                    onChange={(e) => setMasterEditRollNo(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono font-bold text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Size</label>
                                  <input
                                    type="text"
                                    value={masterEditSize}
                                    onChange={(e) => setMasterEditSize(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">GSM</label>
                                  <input
                                    type="number"
                                    value={masterEditGsm}
                                    onChange={(e) => setMasterEditGsm(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Denier</label>
                                  <input
                                    type="number"
                                    value={masterEditDenier}
                                    onChange={(e) => setMasterEditDenier(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">AVG WT</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={masterEditFabricWeight}
                                    onChange={(e) => setMasterEditFabricWeight(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Gross Weight (kg)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={masterEditGrossWt}
                                    onChange={(e) => handleMasterEditGrossChange(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Core Weight (kg)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={masterEditCoreWt}
                                    onChange={(e) => handleMasterEditCoreChange(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-indigo-600 uppercase block">Net Weight (kg)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={masterEditNetWt}
                                    onChange={(e) => handleMasterEditNetChange(e.target.value)}
                                    className="w-full bg-indigo-50 border border-indigo-400 rounded px-2 py-1 font-mono font-bold text-xs text-indigo-950"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-emerald-600 uppercase block">Avg Wt [calc] (grams)</label>
                                  <input
                                    type="number"
                                    step="0.0001"
                                    value={masterEditAvgWtCalculated}
                                    onChange={(e) => setMasterEditAvgWtCalculated(e.target.value)}
                                    className="w-full bg-emerald-50 border border-emerald-400 rounded px-2 py-1 font-mono font-bold text-xs text-emerald-950"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-amber-800 uppercase block">GSM [calc]</label>
                                  <div className="w-full bg-amber-50 border border-amber-300 rounded px-2 py-1 font-mono font-bold text-xs text-amber-950">
                                    {(() => {
                                      const sz = parseFloat(String(masterEditSize || '').replace(/[^0-9.]/g, '')) || 0;
                                      const avg = parseFloat(masterEditAvgWtCalculated) || 0;
                                      return (sz > 0 && avg > 0) ? (avg / sz).toFixed(2) : '-';
                                    })()}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Meters</label>
                                  <input
                                    type="number"
                                    step="1"
                                    value={masterEditMeters}
                                    onChange={(e) => handleMasterEditMetersChange(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 font-mono text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Strength</label>
                                  <input
                                    type="text"
                                    value={masterEditStrength}
                                    onChange={(e) => setMasterEditStrength(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs"
                                    placeholder="Strength"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Elongation (%)</label>
                                  <input
                                    type="text"
                                    value={masterEditElongation}
                                    onChange={(e) => setMasterEditElongation(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs"
                                    placeholder="Elongation %"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Weave Quality</label>
                                  <input
                                    type="text"
                                    value={masterEditQuality}
                                    onChange={(e) => setMasterEditQuality(e.target.value)}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase block">Dispatch Status</label>
                                  <select
                                    value={masterEditDispatchStatus}
                                    onChange={(e) => setMasterEditDispatchStatus(e.target.value as 'Dispatched' | 'Not Dispatched')}
                                    className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs font-bold"
                                  >
                                    <option value="Not Dispatched">Not Dispatched</option>
                                    <option value="Dispatched">Dispatched</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase block">Remarks</label>
                                <input
                                  type="text"
                                  value={masterEditRemarks}
                                  onChange={(e) => setMasterEditRemarks(e.target.value)}
                                  className="w-full bg-white border border-amber-400 rounded px-2 py-1 text-xs"
                                  placeholder="Remarks..."
                                />
                              </div>

                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveMasterRollEdit(item)}
                                  className="flex-1 bg-emerald-600 text-white font-black text-xs py-1.5 rounded-lg text-center"
                                >
                                  Save Changes
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditMasterRoll}
                                  className="bg-zinc-200 text-zinc-800 font-bold text-xs px-3 py-1.5 rounded-lg"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={item.id} className="bg-white border border-zinc-200 rounded-xl p-3 space-y-2 shadow-3xs">
                            <div className="flex justify-between items-center">
                              <span className="bg-amber-100 text-amber-950 font-black font-mono px-2.5 py-0.5 rounded-md border border-amber-300 text-xs">
                                Roll #: {item.rollNo}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                                Order #{item.orderNo}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 text-xs pt-1 border-t border-zinc-100">
                              <div><span className="text-zinc-400 text-[10px]">Size:</span> <strong className="text-zinc-800">{item.size || '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">GSM:</span> <strong className="text-zinc-800 font-mono">{item.gsm || '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Denier:</span> <strong className="text-zinc-800 font-mono">{item.denier || '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">AVG WT:</span> <strong className="text-zinc-800 font-mono">{item.fabricWeight || '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Gross Wt:</span> <strong className="text-zinc-800 font-mono">{item.grossWt || '-'} kg</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Core Wt:</span> <strong className="text-zinc-800 font-mono">{item.coreWt || '-'} kg</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Net Wt:</span> <strong className="text-indigo-900 font-mono font-black">{item.netWt || '-'} kg</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Avg Wt [calc]:</span> <strong className="text-emerald-800 font-mono font-black">{item.avgWtCalculated ? `${item.avgWtCalculated} grams` : '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">GSM [calc]:</span> <strong className="text-amber-900 font-mono font-black">{(() => {
                                const sz = parseFloat(String(item.size || '').replace(/[^0-9.]/g, '')) || 0;
                                const avg = Number(item.avgWtCalculated) || 0;
                                return (sz > 0 && avg > 0) ? (avg / sz).toFixed(2) : '-';
                              })()}</strong></div>
                              <div className="col-span-2"><span className="text-zinc-400 text-[10px]">Meters:</span> <strong className="text-zinc-800 font-mono">{item.meters || '-'} m</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Strength:</span> <strong className="text-zinc-800 font-mono">{item.strength || '-'}</strong></div>
                              <div><span className="text-zinc-400 text-[10px]">Elongation:</span> <strong className="text-zinc-800 font-mono">{item.elongation ? `${item.elongation}%` : '-'}</strong></div>
                              <div className="col-span-2"><span className="text-zinc-400 text-[10px]">Quality:</span> <strong className="text-zinc-900">{item.quality || '-'}</strong></div>
                              <div className="col-span-2 flex items-center justify-between pt-1 border-t border-zinc-100">
                                <span className="text-zinc-500 text-[10px] font-bold flex items-center gap-1">
                                  <Truck size={12} className={item.dispatchStatus === 'Dispatched' ? 'text-emerald-600' : 'text-zinc-400'} />
                                  Dispatch Status:
                                </span>
                                <select
                                  value={item.dispatchStatus}
                                  onChange={(e) => handleUpdateRollDispatchStatus(item, e.target.value as 'Dispatched' | 'Not Dispatched')}
                                  disabled={viewOnly}
                                  className={`text-[11px] font-black px-2 py-0.5 rounded-lg border cursor-pointer ${
                                    item.dispatchStatus === 'Dispatched'
                                      ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                      : 'bg-zinc-100 text-zinc-700 border-zinc-250'
                                  }`}
                                >
                                  <option value="Not Dispatched">Not Dispatched</option>
                                  <option value="Dispatched">Dispatched</option>
                                </select>
                              </div>
                              <div className="col-span-2"><span className="text-zinc-400 text-[10px]">Remarks:</span> <span className="text-zinc-700 italic">{item.remarks || 'None'}</span></div>
                            </div>

                            {!viewOnly && (
                              <div className="flex justify-end gap-2 pt-1 border-t border-zinc-100">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMasterRoll(item)}
                                  className="bg-amber-100 text-amber-900 font-bold text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1"
                                >
                                  <Edit size={12} /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMasterRoll(item)}
                                  className="bg-rose-50 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-3.5 py-3 sm:px-6 sm:py-3.5 border-t border-zinc-200 flex justify-between items-center shrink-0">
              <span className="text-[10px] sm:text-xs font-bold text-zinc-500 font-mono">
                Total {masterRollLedgerData.length} roll(s) registered in database
              </span>
              <button
                type="button"
                onClick={() => setIsMasterLedgerOpen(false)}
                className="bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider py-2.5 px-5 sm:px-6 rounded-xl border border-zinc-800 transition-all shadow-3xs cursor-pointer"
              >
                Close Ledger Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* EXPORT OPTIONS SELECTION MODAL DIALOG */}
      {isExportModalOpen && modalOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-4 py-3.5 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 leading-tight">
                    Export Order to Excel
                  </h3>
                  <p className="text-xs text-zinc-400 font-semibold">
                    Order Ref: <span className="text-amber-300 font-mono font-bold">{modalOrder.orderNo}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              <p className="text-xs font-bold text-zinc-700 uppercase tracking-wide">
                Choose data report option to download:
              </p>

              <div className="space-y-3">
                {/* Option 1: Dispatched Rolls Only */}
                <label
                  onClick={() => setExportOption('dispatched')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    exportOption === 'dispatched'
                      ? 'bg-emerald-50/70 border-emerald-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportOption"
                    value="dispatched"
                    checked={exportOption === 'dispatched'}
                    onChange={() => setExportOption('dispatched')}
                    className="mt-1 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-emerald-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        Dispatched Rolls Only
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports all sub-order varieties/rows showing only roll numbers marked as <strong>Dispatched</strong>. Tonnage & weight columns are omitted.
                    </p>
                  </div>
                </label>

                {/* Option 2: Not Dispatched Rolls Only */}
                <label
                  onClick={() => setExportOption('not_dispatched')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    exportOption === 'not_dispatched'
                      ? 'bg-amber-50/70 border-amber-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportOption"
                    value="not_dispatched"
                    checked={exportOption === 'not_dispatched'}
                    onChange={() => setExportOption('not_dispatched')}
                    className="mt-1 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PackageX size={16} className="text-amber-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        Non-Dispatched Rolls Only
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports all sub-order varieties/rows showing only roll numbers marked as <strong>Not Dispatched</strong>. Tonnage & weight columns are omitted.
                    </p>
                  </div>
                </label>

                {/* Option 3: Both (Complete Order Report) */}
                <label
                  onClick={() => setExportOption('both')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    exportOption === 'both'
                      ? 'bg-sky-50/70 border-sky-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportOption"
                    value="both"
                    checked={exportOption === 'both'}
                    onChange={() => setExportOption('both')}
                    className="mt-1 text-sky-600 focus:ring-sky-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-sky-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        Both (Complete Order Report)
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports full specification details including Target/Completed Weight (KG), Fabric Weight, and all roll numbers (standard complete layout).
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-5 py-3.5 border-t border-zinc-200 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-200 hover:bg-zinc-300 text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExportOrderToExcel(exportOption)}
                className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Download size={14} className="stroke-[2.5]" />
                <span>Download Excel</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* EXPORT OPTIONS SELECTION MODAL DIALOG FOR MASTER ROLL LEDGER */}
      {isMasterLedgerExportModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-zinc-900 text-white px-4 py-3.5 sm:px-6 sm:py-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 leading-tight">
                    Export Master Roll Ledger
                  </h3>
                  <p className="text-xs text-zinc-400 font-semibold">
                    Directory Registry • Total: <span className="text-amber-300 font-mono font-bold">{masterRollLedgerData.length} Rolls</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMasterLedgerExportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              <p className="text-xs font-bold text-zinc-700 uppercase tracking-wide">
                Choose data report option to download:
              </p>

              <div className="space-y-3">
                {/* Option 1: Dispatched Rolls Only */}
                <label
                  onClick={() => setMasterLedgerExportOption('dispatched')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    masterLedgerExportOption === 'dispatched'
                      ? 'bg-emerald-50/70 border-emerald-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="masterLedgerExportOption"
                    value="dispatched"
                    checked={masterLedgerExportOption === 'dispatched'}
                    onChange={() => setMasterLedgerExportOption('dispatched')}
                    className="mt-1 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-emerald-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        For Dispatched Rolls Only
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ml-auto">
                        {masterRollLedgerData.filter(i => i.dispatchStatus === 'Dispatched').length} rolls
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports only roll numbers marked as <strong>Dispatched</strong> across all orders with specs, order reference numbers & dates.
                    </p>
                  </div>
                </label>

                {/* Option 2: Not Dispatched Rolls Only */}
                <label
                  onClick={() => setMasterLedgerExportOption('not_dispatched')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    masterLedgerExportOption === 'not_dispatched'
                      ? 'bg-amber-50/70 border-amber-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="masterLedgerExportOption"
                    value="not_dispatched"
                    checked={masterLedgerExportOption === 'not_dispatched'}
                    onChange={() => setMasterLedgerExportOption('not_dispatched')}
                    className="mt-1 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PackageX size={16} className="text-amber-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        Not Dispatched Rolls Only
                      </span>
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ml-auto">
                        {masterRollLedgerData.filter(i => i.dispatchStatus === 'Not Dispatched').length} rolls
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports only roll numbers marked as <strong>Not Dispatched</strong> across all orders with specs, order reference numbers & dates.
                    </p>
                  </div>
                </label>

                {/* Option 3: Both (Complete Order Report) */}
                <label
                  onClick={() => setMasterLedgerExportOption('both')}
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer transition-all ${
                    masterLedgerExportOption === 'both'
                      ? 'bg-sky-50/70 border-sky-500 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="masterLedgerExportOption"
                    value="both"
                    checked={masterLedgerExportOption === 'both'}
                    onChange={() => setMasterLedgerExportOption('both')}
                    className="mt-1 text-sky-600 focus:ring-sky-500 h-4 w-4 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-sky-600" />
                      <span className="text-xs font-black text-zinc-900 uppercase">
                        Both (Complete Roll Ledger Report)
                      </span>
                      <span className="bg-sky-100 text-sky-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ml-auto">
                        {masterRollLedgerData.length} rolls
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      Exports complete master ledger containing both Dispatched and Not Dispatched rolls across all orders.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-50 px-5 py-3.5 border-t border-zinc-200 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMasterLedgerExportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-200 hover:bg-zinc-300 text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExportMasterRollLedgerToExcel(masterLedgerExportOption)}
                className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Download size={14} className="stroke-[2.5]" />
                <span>Download Excel</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
