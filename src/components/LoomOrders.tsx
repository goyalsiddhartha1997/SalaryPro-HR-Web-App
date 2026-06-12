/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
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
  ChevronDown,
  ChevronUp,
  Tag
} from 'lucide-react';
import { LoomOrder, LoomOrderRow } from '../types';

interface LoomOrdersProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function LoomOrders({ triggerAlert, viewOnly = false }: LoomOrdersProps) {
  // --- FORM STATES ---
  const [orderNo, setOrderNo] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<'Pending' | 'Production' | 'Completed'>('Pending');
  
  // Multiple specification rows matching columns: SIZE, QUALITY, GSM, DENIER, FABRIC WEIGHT PER METER, TOTAL QUANTITY TO MAKE (IN TON)
  const [specRows, setSpecRows] = useState<LoomOrderRow[]>([
    { size: '', quality: '', gsm: 0, denier: 0, fabricWeight: 0, totalQuantity: 0 }
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // --- FILTER & SEARCH STATES ---
  const [searchOrderNo, setSearchOrderNo] = useState<string>('');
  const [searchDate, setSearchDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // --- REAL-TIME FIRESTORE STREAM ---
  const [orders, setOrders] = useState<LoomOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync real-time stream of PP Fabric Loom Orders
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'loomOrders');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: LoomOrder[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as LoomOrder);
      });
      // Sort: newest first safely (handle empty or missing createdAt timestamps)
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

  // --- MODEL ACTIONS ---
  
  // Add a new empty specification row
  const handleAddSpecRow = () => {
    setSpecRows((prev) => [
      ...prev,
      { size: '', quality: '', gsm: 0, denier: 0, fabricWeight: 0, totalQuantity: 0 }
    ]);
  };

  // Remove a specification row
  const handleRemoveSpecRow = (index: number) => {
    if (specRows.length === 1) {
      triggerAlert('warn', 'An order must contain at least one specification row.');
      return;
    }
    setSpecRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Change individual specification values
  const handleSpecRowChange = (index: number, field: keyof LoomOrderRow, value: any) => {
    setSpecRows((prev) => {
      const updated = [...prev];
      if (field === 'gsm' || field === 'denier' || field === 'fabricWeight' || field === 'totalQuantity') {
        const val = parseFloat(value);
        updated[index] = {
          ...updated[index],
          [field]: isNaN(val) ? 0 : val
        };
      } else {
        updated[index] = {
          ...updated[index],
          [field]: value
        };
      }
      return updated;
    });
  };

  // Submit/Save the fabric loom order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('warn', 'Action Restricted. Creating/editing plant orders is locked in read-only observer sessions.');
      return;
    }

    if (!orderNo.trim()) {
      triggerAlert('warn', 'Please specify a valid Order No.');
      return;
    }

    if (!orderDate) {
      triggerAlert('warn', 'Please select an Order Date.');
      return;
    }

    // Basic validation of spec details
    const hasInvalidRow = specRows.some(row => 
      !row.size.trim() || 
      !row.quality.trim() || 
      row.gsm <= 0 || 
      row.denier <= 0 || 
      row.fabricWeight <= 0 || 
      row.totalQuantity <= 0
    );

    if (hasInvalidRow) {
      triggerAlert('warn', 'Please fill in all size, quality, GSM (>0), denier (>0), fabric weight (>0), and tonnage (>0) fields in the table.');
      return;
    }

    setIsSubmitting(true);
    const targetId = editingOrderId || `L_ORD_${Date.now()}`;
    const payload: LoomOrder = {
      id: targetId,
      orderNo: orderNo.trim(),
      date: orderDate,
      status: status,
      rows: specRows,
      createdAt: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      const orderRef = doc(db, 'loomOrders', targetId);
      await setDoc(orderRef, payload);
      
      triggerAlert(
        'success', 
        editingOrderId 
          ? `Loom Order ${orderNo} updated successfully.` 
          : `Loom Order ${orderNo} created successfully with ${specRows.length} specifications.`
      );
      
      // Reset Form State
      handleResetForm();
    } catch (err: any) {
      console.error("Failed to commit Loom Order record", err);
      handleFirestoreError(err, OperationType.WRITE, `loomOrders/${targetId}`);
      const fallbackMsg = err?.message || String(err);
      triggerAlert('warn', `Unable to write Loom Order: ${fallbackMsg}. Please check database permissions.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset the form
  const handleResetForm = () => {
    setOrderNo('');
    const today = new Date();
    setOrderDate(today.toISOString().split('T')[0]);
    setStatus('Pending');
    setSpecRows([{ size: '', quality: '', gsm: 0, denier: 0, fabricWeight: 0, totalQuantity: 0 }]);
    setEditingOrderId(null);
  };

  // Load order data into the form for editing
  const handleEditOrder = (order: LoomOrder) => {
    if (viewOnly) {
      triggerAlert('warn', 'Portal is in read-only mode.');
      return;
    }
    setEditingOrderId(order.id);
    setOrderNo(order.orderNo);
    setOrderDate(order.date);
    setStatus(order.status);
    setSpecRows(order.rows.map(row => ({ ...row }))); // clone rows
    triggerAlert('info', `Order ${order.orderNo} is loaded into the form. You can adjust the parameters now.`);
  };

  // Delete an order
  const handleDeleteOrder = async (id: string, code: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'portal is in read-only mode.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'loomOrders', id));
      triggerAlert('success', `Loom Order ${code} deleted successfully.`);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete loom order", err);
      triggerAlert('warn', 'Permission denied. Could not delete order record.');
    }
  };

  // --- COMBINED FILTERING & SEARCH STATEMENTS ---
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Order No match
      const orderNoMatch = order.orderNo.toLowerCase().includes(searchOrderNo.toLowerCase());
      
      // 2. Date match
      const dateMatch = !searchDate || order.date === searchDate;
      
      // 3. Status match
      const statusMatch = filterStatus === 'All' || order.status === filterStatus;

      // 4. Also search inside row quality/size specifications if orderNo doesn't match
      const specMatch = order.rows.some(row => 
        row.quality.toLowerCase().includes(searchOrderNo.toLowerCase()) ||
        row.size.toLowerCase().includes(searchOrderNo.toLowerCase())
      );

      return (orderNoMatch || specMatch) && dateMatch && statusMatch;
    });
  }, [orders, searchOrderNo, searchDate, filterStatus]);

  // Aggregate stats across orders
  const loomStats = useMemo(() => {
    let totalTons = 0;
    let totalSpecs = 0;
    filteredOrders.forEach(o => {
      o.rows.forEach(r => {
        totalTons += r.totalQuantity;
        totalSpecs += 1;
      });
    });
    return {
      ordersCount: filteredOrders.length,
      specsCount: totalSpecs,
      totalTonnage: totalTons
    };
  }, [filteredOrders]);

  return (
    <div className="w-full flex flex-col font-sans text-slate-705 animate-fade-in pb-10" id="loom-orders-plant-panel">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6" id="loom-header">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            PP Fabric Loom Orders
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registry to schedule, specifications logging and search of orders under active PP Fabric loom operations.
          </p>
        </div>
        
        {/* Rapid Stats counters */}
        <div className="flex flex-wrap items-center gap-2 mt-1 md:mt-0">
          <div className="bg-white border border-slate-100 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400 leading-none">Total Orders</p>
              <p className="text-xs font-black text-slate-700 mt-0.5 leading-none">{filteredOrders.length}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400 leading-none">Target Volume</p>
              <p className="text-xs font-black text-emerald-600 mt-0.5 leading-none font-mono">{Number(loomStats.totalTonnage.toFixed(4))} Tons</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" id="loom-main-content">
        
        {/* ================= LEFT COLUMN: FORM CONSOLE ================= */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          <form 
            onSubmit={handleSubmitOrder}
            className="bg-white rounded-3xl border border-slate-100 shadow-xs p-5 md:p-6 flex flex-col justify-between"
            id="loom-order-input-form"
          >
            <div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-2 bg-indigo-50 text-indigo-600 rounded-lg font-black text-[10px] tracking-wide uppercase">
                    PLC Console
                  </div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                    {editingOrderId ? 'Edit Loom Order' : 'New Plant Order'}
                  </h3>
                </div>
                {editingOrderId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-[10px] font-extrabold text-rose-500 hover:text-rose-600 transition-colors bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase"
                  >
                    <X size={10} /> Cancel Edit
                  </button>
                )}
              </div>

              {/* Order Meta row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-450 tracking-wider block mb-1">
                    Order No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    placeholder="e.g. PP-LOOM-250"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl py-2 px-3 text-xs font-extrabold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-450 tracking-wider block mb-1">
                    Order Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-450 tracking-wider block mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl py-2 px-3 text-xs font-extrabold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Production">Production</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Multiple Specification Rows */}
              <div className="border-t border-slate-100 pt-3 mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                    Order Specifications ({specRows.length} {specRows.length === 1 ? 'Row' : 'Rows'})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSpecRow}
                    className="text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-100/60 hover:text-indigo-800 transition-all flex items-center gap-1 uppercase"
                  >
                    <Plus size={11} /> Add spec row
                  </button>
                </div>

                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                  {specRows.map((row, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 bg-slate-50/50 border border-slate-150 rounded-2xl relative flex flex-col gap-2.5 animate-fadeIn"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-extrabold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          SPEC ITEM #{idx + 1}
                        </span>
                        {specRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSpecRow(idx)}
                            className="text-slate-400 hover:text-rose-500 transition-all"
                            title="Remove Row"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Row specifications grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        
                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Size <span className="text-rose-500">*</span></label>
                          <input
                            type="text"
                            value={row.size}
                            onChange={(e) => handleSpecRowChange(idx, 'size', e.target.value)}
                            placeholder="e.g. 24 inches / 60cm"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Quality <span className="text-rose-500">*</span></label>
                          <input
                            type="text"
                            value={row.quality}
                            onChange={(e) => handleSpecRowChange(idx, 'quality', e.target.value)}
                            placeholder="e.g. Milky White / Laminated"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">GSM <span className="text-rose-500">*</span></label>
                          <input
                            type="number"
                            step="any"
                            value={row.gsm || ''}
                            onChange={(e) => handleSpecRowChange(idx, 'gsm', e.target.value)}
                            placeholder="e.g. 60.5"
                            min="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Denier <span className="text-rose-500">*</span></label>
                          <input
                            type="number"
                            step="any"
                            value={row.denier || ''}
                            onChange={(e) => handleSpecRowChange(idx, 'denier', e.target.value)}
                            placeholder="e.g. 750"
                            min="0.1"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Weight Per Meter (g) <span className="text-rose-500">*</span></label>
                          <input
                            type="number"
                            step="any"
                            value={row.fabricWeight || ''}
                            onChange={(e) => handleSpecRowChange(idx, 'fabricWeight', e.target.value)}
                            placeholder="e.g. 52.5"
                            min="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Tonnage to make (Tons) <span className="text-rose-500">*</span></label>
                          <input
                            type="number"
                            step="any"
                            value={row.totalQuantity || ''}
                            onChange={(e) => handleSpecRowChange(idx, 'totalQuantity', e.target.value)}
                            placeholder="e.g. 2.45"
                            min="0.001"
                            className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            required
                          />
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Submission Action Box */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl py-3 font-extrabold text-xs uppercase tracking-widest shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>Saving Order...</>
                ) : editingOrderId ? (
                  <>Save Changes</>
                ) : (
                  <>Save Order Detail</>
                )}
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs px-3 rounded-xl uppercase tracking-wider transition-all"
              >
                Clear
              </button>
            </div>
          </form>

          {/* Quick Informational alert Box */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-slate-600 animate-fadeIn shadow-3xs" id="loom-info-card">
            <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-extrabold text-slate-800 uppercase block mb-1">
                PP Fabric Loom Plant Rules
              </span>
              Orders must uniquely declare specifications according to fabric density (GSM) and weaving criteria (Denier). High-tonnage operations trigger automatic production indicators under active shifts.
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: SEARCH & LIST ================= */}
        <div className="xl:col-span-7 flex flex-col min-h-[500px]" id="loom-orders-schedule-ledger">
          
          {/* Controls Bar */}
          <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-4 shadow-3xs" id="loom-search-box">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
              Refinement Controls
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* Order code/spec query */}
              <div className="sm:col-span-5 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Order No or Quality..."
                  value={searchOrderNo}
                  onChange={(e) => setSearchOrderNo(e.target.value)}
                  className="w-full pl-9 pr-3 bg-slate-50/50 border border-slate-200 rounded-xl py-2 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* Specific Date */}
              <div className="sm:col-span-3">
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Status filter */}
              <div className="sm:col-span-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-2 px-2 text-[11px] font-extrabold text-slate-700 cursor-pointer focus:outline-none"
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Production">Production</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Show All options */}
              <button
                type="button"
                onClick={() => {
                  setSearchOrderNo('');
                  setSearchDate('');
                  setFilterStatus('All');
                }}
                className="sm:col-span-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold text-xs rounded-xl py-2 text-center uppercase tracking-wider transition-all shrink-0"
              >
                Show All
              </button>
            </div>
          </div>

          {/* Loom Orders Ledger Lists */}
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[700px] pr-1">
            {loading ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-xs">
                <Clock className="animate-spin text-indigo-500 mx-auto mb-3" size={24} />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Querying PP Loom records...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center select-none shadow-xs">
                <FileSpreadsheet className="text-slate-200 mx-auto mb-4" size={48} />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest font-mono">No Loom Orders Found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No factory orders match your filters. Enter details on the left console or tap "Show All" to load active schedule records.
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const totalOrderTons = order.rows.reduce((sum, r) => sum + r.totalQuantity, 0);
                
                // Status styles
                const statusStyles = {
                  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
                  Production: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-extrabold ring-1 ring-emerald-500/20 active-state-bloom',
                  Completed: 'bg-indigo-50 text-indigo-700 border-indigo-200'
                };

                // Format display date e.g. "08 Jun 2026"
                let dateFormatted = order.date;
                try {
                  const monthsName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const [yr, mo, dy] = order.date.split('-');
                  if (yr && mo && dy) {
                    dateFormatted = `${dy} ${monthsName[parseInt(mo, 10) - 1]} ${yr}`;
                  }
                } catch (e) {}

                return (
                  <div 
                    key={order.id}
                    className="bg-white rounded-3xl border border-slate-100 hover:border-slate-200 shadow-xs hover:shadow-sm p-5 transition-all animate-fadeIn"
                  >
                    
                    {/* Header bar of Cardiff Order details */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-rose-50/50 pb-3 mb-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 font-black text-[11px] border border-slate-150">
                          PLC
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-800 font-mono tracking-tight">
                              {order.orderNo}
                            </span>
                            <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 border rounded-full ${statusStyles[order.status] || 'bg-slate-50'}`}>
                              {order.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5 font-semibold">
                            <span className="flex items-center gap-1">
                              <CalendarIcon size={12} className="text-slate-350" /> {dateFormatted}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-mono">
                              ID: {order.id.replace('L_ORD_', '')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Cumulative Volume */}
                      <div className="flex items-center gap-3 sm:text-right shrink-0">
                        <div className="bg-emerald-50/30 border border-emerald-100/50 rounded-2xl p-2 px-3">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Aggregate Volume</p>
                          <p className="text-xs font-black text-emerald-600 font-mono mt-0.5">{Number(totalOrderTons.toFixed(4))} Tons</p>
                        </div>

                        {/* Edit Buttons */}
                        <div className="flex items-center gap-1.5 self-center">
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 p-2 rounded-xl border border-slate-150 transition-all"
                            title="Edit Order Specifications"
                          >
                            <Edit size={13} />
                          </button>
                          
                          {deleteConfirmId === order.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl p-1 animate-fadeIn">
                              <button
                                onClick={() => handleDeleteOrder(order.id, order.orderNo)}
                                className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[9px] px-2 py-1 rounded-lg uppercase tracking-wider transition-all"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(order.id)}
                              className="bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 p-2 rounded-xl border border-slate-150 transition-all"
                              title="Delete Order Record"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Table of multiple rows specs inside the card */}
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl" id="specifications-items-registry">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/65 border-b border-slate-150 py-2">
                            <th className="py-2.5 px-3 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans">#</th>
                            <th className="py-2.5 px-2 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans">Size</th>
                            <th className="py-2.5 px-2 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans">Quality</th>
                            <th className="py-2.5 px-2 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans text-center">GSM</th>
                            <th className="py-2.5 px-2 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans text-center">Denier</th>
                            <th className="py-2.5 px-2 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans text-right">Fabric Wt (g/m)</th>
                            <th className="py-2.5 px-3 text-[8px] font-black text-slate-450 uppercase tracking-wider font-sans text-right">Tonnage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {order.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/30 transition-all font-mono">
                              <td className="py-2 px-3 text-[10px] text-slate-400 font-extrabold">{rIdx+1}</td>
                              <td className="py-2 px-2 text-[10px] text-slate-700 font-black uppercase font-sans">{row.size}</td>
                              <td className="py-2 px-2 text-[10px] text-slate-650 font-bold uppercase font-sans break-words max-w-[120px]" title={row.quality}>
                                {row.quality}
                              </td>
                              <td className="py-2 px-2 text-[10px] text-slate-700 text-center">{row.gsm}</td>
                              <td className="py-2 px-2 text-[10px] text-slate-700 text-center">{row.denier}</td>
                              <td className="py-2 px-2 text-[10px] text-slate-700 text-right">{Number(row.fabricWeight.toFixed(4))} g</td>
                              <td className="py-2 px-3 text-[10px] text-indigo-650 font-black text-right">{Number(row.totalQuantity.toFixed(4))} T</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
