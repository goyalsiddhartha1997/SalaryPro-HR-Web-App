/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Check, 
  Search, 
  X, 
  Info, 
  AlertCircle, 
  Save, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  CheckCircle, 
  Package, 
  History, 
  Calendar, 
  Edit3,
  Filter,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  FileSpreadsheet
} from 'lucide-react';
import { RawMaterialItem, InventoryLog } from '../types';

const formatDateToDMY = (dateStr?: string) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${day} ${months[mIdx]} ${year}`;
    }
    return `${day}-${month}-${year}`;
  }
  return dateStr;
};

interface RawMaterialsInventoryProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function RawMaterialsInventory({ triggerAlert, viewOnly = false }: RawMaterialsInventoryProps) {
  const [items, setItems] = useState<RawMaterialItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('All'); // 'All', 'Low Stock', 'Normal'

  // Modal / Form States
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('PP Granules');
  const [newNoOfBags, setNewNoOfBags] = useState<string>('');
  const [newKgPerBag, setNewKgPerBag] = useState<string>('25');
  const [newStock, setNewStock] = useState<string>('0');
  const [newUnit, setNewUnit] = useState<string>('kg');
  const [newRemarks, setNewRemarks] = useState<string>('');
  const [newMaterialDate, setNewMaterialDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);

  // Auto-calculate initial stock when number of bags and kg per bag are input
  useEffect(() => {
    const bags = parseFloat(newNoOfBags);
    const kg = parseFloat(newKgPerBag);
    if (!isNaN(bags) && !isNaN(kg) && bags > 0 && kg > 0) {
      setNewStock(String(bags * kg));
    }
  }, [newNoOfBags, newKgPerBag]);

  // Quick Action States (Add/Deduct Stock)
  const [activeActionItem, setActiveActionItem] = useState<RawMaterialItem | null>(null);
  const [actionType, setActionType] = useState<'add' | 'deduct' | null>(null);
  const [actionQty, setActionQty] = useState<string>('');
  const [actionRemarks, setActionRemarks] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionDate, setActionDate] = useState<string>('');
  const [actionShift, setActionShift] = useState<'Day Shift' | 'Night Shift'>('Day Shift');
  const [actionStage, setActionStage] = useState<string>('Extrusion / Tape Line');
  const [actionWastage, setActionWastage] = useState<string>('');
  const [actionReconciliation, setActionReconciliation] = useState<string>('Balanced');

  // Selected Ledger Month/Year and Tab (Default to current)
  const [selectedLedgerMonth, setSelectedLedgerMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [selectedLedgerYear, setSelectedLedgerYear] = useState<string>(String(new Date().getFullYear()));
  const [ledgerTab, setLedgerTab] = useState<'additions' | 'deductions'>('additions');

  // Daily / Shift-wise Material Audit Ledger States
  const [ledgerAuditDate, setLedgerAuditDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [ledgerAuditShift, setLedgerAuditShift] = useState<'All' | 'Day Shift' | 'Night Shift'>('All');

  // Popup History Modals States
  const [showAddHistoryModal, setShowAddHistoryModal] = useState<boolean>(false);
  const [showUseHistoryModal, setShowUseHistoryModal] = useState<boolean>(false);

  // Month & Year selection filters for Additions & Deductions popups
  const [addHistoryMonth, setAddHistoryMonth] = useState<string>('All');
  const [addHistoryYear, setAddHistoryYear] = useState<string>('All');
  const [useHistoryMonth, setUseHistoryMonth] = useState<string>('All');
  const [useHistoryYear, setUseHistoryYear] = useState<string>('All');

  // Inline Editing States
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editNoOfBags, setEditNoOfBags] = useState<string>('');
  const [editKgPerBag, setEditKgPerBag] = useState<string>('');
  const [editStock, setEditStock] = useState<string>('');
  const [editUnit, setEditUnit] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');

  // Log Inline Editing States
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogDate, setEditLogDate] = useState<string>('');
  const [editLogQty, setEditLogQty] = useState<string>('');
  const [editLogOperator, setEditLogOperator] = useState<string>('');
  const [editLogRemarks, setEditLogRemarks] = useState<string>('');
  const [editLogReconciliation, setEditLogReconciliation] = useState<string>('');
  const [editLogShift, setEditLogShift] = useState<'Day Shift' | 'Night Shift'>('Day Shift');
  const [editLogStage, setEditLogStage] = useState<string>('');
  const [editLogWastage, setEditLogWastage] = useState<string>('');

  // Selected Item for viewing history log
  const [selectedItemForLogs, setSelectedItemForLogs] = useState<RawMaterialItem | null>(null);

  // Default Seed Data
  const DEFAULT_MATERIALS: Omit<RawMaterialItem, 'id' | 'lastUpdated'>[] = [
    { name: 'PP Granules (Raffia - Reprocessed)', category: 'PP Granules', currentStock: 12500, unit: 'kg', remarks: 'Standard domestic grade for high toughness tape', noOfBags: 500, kgPerBag: 25 },
    { name: 'PP Granules (Reliance H110MA)', category: 'PP Granules', currentStock: 24000, unit: 'kg', remarks: 'Virgin Reliance polymer grade for high durability tapes', noOfBags: 960, kgPerBag: 25 },
    { name: 'Calcium Carbonate Filler (PP Masterbatch)', category: 'Filler', currentStock: 8500, unit: 'kg', remarks: 'High percentage calcium carbonate filler masterbatch', noOfBags: 340, kgPerBag: 25 },
    { name: 'LDPE Granules (Standard)', category: 'LDPE', currentStock: 3200, unit: 'kg', remarks: 'Used for enhancing tape elasticity and film strength', noOfBags: 128, kgPerBag: 25 },
    { name: 'TPT White Masterbatch (Titanium Dioxide)', category: 'TPT', currentStock: 1500, unit: 'kg', remarks: 'White pigment masterbatch with high dispersion index', noOfBags: 60, kgPerBag: 25 },
    { name: 'UV Stabilizer Masterbatch', category: 'UV Stabilizer', currentStock: 800, unit: 'kg', remarks: 'Anti-UV additive to protect tape from sunlight degradation', noOfBags: 32, kgPerBag: 25 }
  ];

  // Streaming real-time inventory from Firestore
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'rawMaterials');
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let hasSeedMarker = false;
      const list: RawMaterialItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RawMaterialItem;
        if (docSnap.id === 'seed_marker' || data.id === 'seed_marker') {
          hasSeedMarker = true;
        } else {
          list.push(data);
        }
      });

      // If the database is empty, seed initial data to make it look outstanding on first load
      if (list.length === 0 && !hasSeedMarker && !viewOnly) {
        try {
          const batch = writeBatch(db);
          
          // Write an internal marker to prevent automatic database re-seeding if the user deletes everything
          const markerRef = doc(db, 'rawMaterials', 'seed_marker');
          const markerNow = new Date().toISOString();
          const markerItem: RawMaterialItem = {
            id: 'seed_marker',
            name: 'SEED_MARKER',
            category: 'System',
            currentStock: 0,
            unit: 'pkg',
            remarks: 'Internal marker to prevent automatic database re-seeding',
            lastUpdated: markerNow,
            logs: []
          };
          batch.set(markerRef, markerItem);

          DEFAULT_MATERIALS.forEach((mat) => {
            const itemRef = doc(collection(db, 'rawMaterials'));
            const id = itemRef.id;
            const now = new Date().toISOString();
            const initialLog: InventoryLog = {
              id: `LOG_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
              date: now.split('T')[0],
              type: 'add_stock',
              quantity: mat.currentStock,
              remarks: 'Initial stock setup during inventory onboarding',
              operator: 'System Admin',
              createdAt: now
            };
            const newItem: RawMaterialItem = {
              ...mat,
              id,
              lastUpdated: now,
              logs: [initialLog]
            };
            batch.set(itemRef, newItem);
            list.push(newItem);
          });
          await batch.commit();
          triggerAlert('success', 'Successfully initialized default PP Tape Plant raw materials inventory list.');
        } catch (err) {
          console.error('Failed to seed raw materials', err);
        }
      }

      // Sort: Name alphabetical
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setItems(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to stream raw materials', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [viewOnly]);

  // Sync selected logs viewer if it updates in list
  useEffect(() => {
    if (selectedItemForLogs) {
      const updated = items.find(i => i.id === selectedItemForLogs.id);
      if (updated) {
        setSelectedItemForLogs(updated);
      }
    }
  }, [items, selectedItemForLogs]);

  // Category Categories derived dynamically
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered Inventory List
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (item.remarks || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
      
      // Low Stock defined as < 2,000 kg as a default warning threshold for materials in a tape plant
      const isLowStock = item.currentStock < 2000;
      const matchesStockStatus = stockStatusFilter === 'All' || 
                                (stockStatusFilter === 'Low Stock' && isLowStock) ||
                                (stockStatusFilter === 'Normal' && !isLowStock);
      
      return matchesSearch && matchesCategory && matchesStockStatus;
    });
  }, [items, searchQuery, categoryFilter, stockStatusFilter]);

  // ----------------- COMPUTE PERSISTENT DAILY/SHIFT AUDIT LEDGER -----------------
  const dailyAuditLedgerData = useMemo(() => {
    return items
      .filter(item => item.id !== 'seed_marker')
      .map(item => {
        // Sort logs in reverse chronological order to reconstruct balance backwards from current balance
        const sortedLogs = [...(item.logs || [])].sort((a, b) => {
          const timeA = a.date + 'T' + (a.createdAt?.split('T')[1] || '00:00:00');
          const timeB = b.date + 'T' + (b.createdAt?.split('T')[1] || '00:00:00');
          return timeB.localeCompare(timeA); // newest first
        });

        // Reconstruct balances backwards
        let runningStock = item.currentStock;
        const logsWithBalance = sortedLogs.map(log => {
          const stockAfter = runningStock;
          let stockBefore = runningStock;
          if (log.type === 'add_stock') {
            stockBefore = runningStock - log.quantity;
          } else if (log.type === 'use_stock') {
            stockBefore = runningStock + log.quantity;
          }
          runningStock = stockBefore;
          return {
            ...log,
            stockBefore,
            stockAfter
          };
        });

        // Find usage/consumption logs on the specific ledgerAuditDate
        const usageOnDate = logsWithBalance.filter(l => 
          l.date === ledgerAuditDate && 
          l.type === 'use_stock' &&
          (ledgerAuditShift === 'All' || l.shift === ledgerAuditShift)
        );

        const totalConsumed = usageOnDate.reduce((sum, l) => sum + l.quantity, 0);
        const totalWastage = usageOnDate.reduce((sum, l) => sum + (l.wastage || 0), 0);
        const remarksList = usageOnDate.map(l => l.remarks).filter(Boolean).join(', ');

        // Compute Opening & Final stocks on ledgerAuditDate
        // The final stock level on ledgerAuditDate is the balance AFTER the latest transaction on or before that date.
        const logsPriorOrOnDate = logsWithBalance.filter(l => l.date <= ledgerAuditDate);
        const latestLogOnOrBefore = logsPriorOrOnDate[0];
        const finalStock = latestLogOnOrBefore ? latestLogOnOrBefore.stockAfter : runningStock;

        // Opening stock is the balance BEFORE the oldest transaction on ledgerAuditDate.
        const logsOnDate = logsWithBalance.filter(l => l.date === ledgerAuditDate);
        const oldestLogOnDate = logsOnDate[logsOnDate.length - 1];
        const openingStock = oldestLogOnDate ? oldestLogOnDate.stockBefore : finalStock;

        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          category: item.category,
          openingStock,
          consumption: totalConsumed,
          wastage: totalWastage,
          finalStock,
          remarks: remarksList || (usageOnDate.length > 0 ? '' : 'No usage today')
        };
      });
  }, [items, ledgerAuditDate, ledgerAuditShift]);

  // ----------------- COMPILE & FILTER LOGS FOR MATERIAL AUDIT LEDGERS -----------------
  const allLogs = useMemo(() => {
    const list: { materialName: string; materialId: string; materialUnit: string; log: InventoryLog }[] = [];
    items.forEach(item => {
      if (item.id === 'seed_marker') return;
      if (item.logs) {
        item.logs.forEach(log => {
          list.push({
            materialName: item.name,
            materialId: item.id,
            materialUnit: item.unit,
            log
          });
        });
      }
    });
    // Sort all logs by log date descending, then createdAt descending
    return list.sort((a, b) => {
      const dateA = a.log.date + 'T' + (a.log.createdAt?.split('T')[1] || '00:00:00');
      const dateB = b.log.date + 'T' + (b.log.createdAt?.split('T')[1] || '00:00:00');
      return dateB.localeCompare(dateA);
    });
  }, [items]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter(entry => {
      const log = entry.log;
      
      // 1. Filter by item focus
      if (selectedItemForLogs && entry.materialId !== selectedItemForLogs.id) {
        return false;
      }
      
      // 2. Filter by tab type
      const isAdd = log.type === 'add_stock';
      if (ledgerTab === 'additions' && !isAdd) return false;
      if (ledgerTab === 'deductions' && isAdd) return false;
      
      // 3. Filter by month and year
      if (log.date) {
        const parts = log.date.split('-');
        if (parts.length === 3) {
          const y = parts[0];
          const m = parseInt(parts[1], 10).toString(); // remove leading zeros (e.g. "07" -> "7")
          
          if (selectedLedgerYear !== 'All' && y !== selectedLedgerYear) return false;
          if (selectedLedgerMonth !== 'All' && m !== selectedLedgerMonth) return false;
        }
      }
      
      return true;
    });
  }, [allLogs, selectedItemForLogs, ledgerTab, selectedLedgerMonth, selectedLedgerYear]);

  // Filtered addition logs for the "Add History" popup
  const filteredAddHistoryLogs = useMemo(() => {
    return allLogs.filter(entry => {
      if (entry.log.type !== 'add_stock') return false;
      const d = entry.log.date;
      if (d) {
        const parts = d.split('-');
        if (parts.length === 3) {
          const y = parts[0];
          const m = parseInt(parts[1], 10).toString();
          if (addHistoryYear !== 'All' && y !== addHistoryYear) return false;
          if (addHistoryMonth !== 'All' && m !== addHistoryMonth) return false;
        }
      }
      return true;
    });
  }, [allLogs, addHistoryMonth, addHistoryYear]);

  // Filtered deduction logs for the "Use History" popup
  const filteredUseHistoryLogs = useMemo(() => {
    return allLogs.filter(entry => {
      if (entry.log.type !== 'use_stock') return false;
      const d = entry.log.date;
      if (d) {
        const parts = d.split('-');
        if (parts.length === 3) {
          const y = parts[0];
          const m = parseInt(parts[1], 10).toString();
          if (useHistoryYear !== 'All' && y !== useHistoryYear) return false;
          if (useHistoryMonth !== 'All' && m !== useHistoryMonth) return false;
        }
      }
      return true;
    });
  }, [allLogs, useHistoryMonth, useHistoryYear]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalStockKgs = 0;
    let lowStockCount = 0;
    let totalVarieties = items.length;
    let todayUsageKgs = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    items.forEach(item => {
      // Stock conversion to display equivalent (assume mostly kg)
      totalStockKgs += item.currentStock;
      if (item.currentStock < 2000) {
        lowStockCount++;
      }

      // Today's usage accumulation
      if (item.logs) {
        item.logs.forEach(log => {
          if (log.date === todayStr && log.type === 'use_stock') {
            todayUsageKgs += log.quantity;
          }
        });
      }
    });

    return {
      totalStockKgs,
      lowStockCount,
      totalVarieties,
      todayUsageKgs
    };
  }, [items]);

  // Add New Material Submission
  const handleAddNewMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    if (!newName.trim() || !newCategory.trim() || !newUnit.trim()) {
      triggerAlert('warn', 'Please complete all required fields correctly.');
      return;
    }

    const initialQty = parseFloat(newStock) || 0;
    if (initialQty < 0) {
      triggerAlert('warn', 'Initial stock cannot be negative.');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const itemRef = doc(collection(db, 'rawMaterials'));
      const id = itemRef.id;
      const now = new Date().toISOString();
      const initialLog: InventoryLog = {
        id: `LOG_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        date: newMaterialDate || now.split('T')[0],
        type: 'add_stock',
        quantity: initialQty,
        remarks: newRemarks.trim() ? `Initial Setup: ${newRemarks.trim()}` : 'Initial stock setup upon material registration',
        operator: 'HR Manager',
        createdAt: now
      };

      const bagsVal = parseFloat(newNoOfBags);
      const kgVal = parseFloat(newKgPerBag);

      const newItem: RawMaterialItem = {
        id,
        name: newName.trim(),
        category: newCategory.trim(),
        currentStock: initialQty,
        unit: newUnit.trim(),
        remarks: newRemarks.trim() || '',
        lastUpdated: now,
        registrationDate: newMaterialDate || now.split('T')[0],
        logs: [initialLog]
      };

      if (!isNaN(bagsVal) && newNoOfBags.trim() !== '') {
        newItem.noOfBags = bagsVal;
      }
      if (!isNaN(kgVal) && newKgPerBag.trim() !== '') {
        newItem.kgPerBag = kgVal;
      }

      await setDoc(itemRef, newItem);
      triggerAlert('success', `Successfully added raw material "${newName}" with ${initialQty} ${newUnit} stock.`);
      
      // Reset Form
      setNewName('');
      setNewStock('0');
      setNewNoOfBags('');
      setNewKgPerBag('25');
      setNewRemarks('');
      setNewMaterialDate(new Date().toISOString().split('T')[0]);
      setShowAddModal(false);
    } catch (err) {
      console.error('Error adding raw material', err);
      triggerAlert('warn', 'Failed to write new material record to cloud database.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Quick Action Submission (replenish or deduct)
  const handleQuickActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    if (!activeActionItem || !actionType) return;

    const qty = parseFloat(actionQty) || 0;
    if (qty <= 0) {
      triggerAlert('warn', 'Please input a valid quantity greater than 0.');
      return;
    }

    if (actionType === 'deduct' && qty > activeActionItem.currentStock) {
      triggerAlert('warn', `Insufficient stock! Cannot deduct ${qty} ${activeActionItem.unit} because only ${activeActionItem.currentStock} ${activeActionItem.unit} is left.`);
      return;
    }

    setIsSubmittingAction(true);
    try {
      const itemRef = doc(db, 'rawMaterials', activeActionItem.id);
      const now = new Date().toISOString();
      
      const newLog: InventoryLog = {
        id: `LOG_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        date: actionDate || now.split('T')[0],
        type: actionType === 'add' ? 'add_stock' : 'use_stock',
        quantity: qty,
        remarks: actionRemarks.trim() || (actionType === 'add' ? 'Received stock replenishment' : 'Disbursed for plant production line usage'),
        operator: 'HR Supervisor',
        createdAt: now,
        reconciliation: actionReconciliation.trim() || 'Balanced'
      };

      if (actionType === 'deduct') {
        newLog.shift = actionShift;
        newLog.stage = actionStage;
        if (actionWastage.trim() !== '') {
          const wNum = parseFloat(actionWastage);
          if (!isNaN(wNum) && wNum >= 0) {
            newLog.wastage = wNum;
          }
        }
      }

      const finalStock = actionType === 'add' 
        ? activeActionItem.currentStock + qty 
        : activeActionItem.currentStock - qty;

      const currentLogs = activeActionItem.logs || [];
      const updatedItem: RawMaterialItem = {
        ...activeActionItem,
        currentStock: Math.round(finalStock * 100) / 100,
        lastUpdated: now,
        logs: [newLog, ...currentLogs].slice(0, 50) // Store last 50 transactions for performance
      };

      if (activeActionItem.kgPerBag && activeActionItem.kgPerBag > 0) {
        updatedItem.noOfBags = Math.round((finalStock / activeActionItem.kgPerBag) * 100) / 100;
      }

      await setDoc(itemRef, updatedItem);
      triggerAlert('success', `Successfully ${actionType === 'add' ? 'added' : 'deducted'} ${qty} ${activeActionItem.unit} of ${activeActionItem.name}.`);
      
      // Close & reset
      setActiveActionItem(null);
      setActionType(null);
      setActionQty('');
      setActionRemarks('');
      setActionDate('');
      setActionWastage('');
      setActionReconciliation('Balanced');
    } catch (err) {
      console.error('Quick action failed', err);
      triggerAlert('warn', 'Could not update material stock on database.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Start Inline Editing for Row
  const startInlineEdit = (item: RawMaterialItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditStock(String(item.currentStock));
    setEditUnit(item.unit);
    setEditRemarks(item.remarks || '');
    setEditNoOfBags(item.noOfBags !== undefined ? String(item.noOfBags) : '');
    setEditKgPerBag(item.kgPerBag !== undefined ? String(item.kgPerBag) : '');
  };

  // Save Inline Editing Row
  const saveInlineEdit = async (item: RawMaterialItem) => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    if (!editName.trim() || !editCategory.trim() || !editUnit.trim()) {
      triggerAlert('warn', 'Required fields cannot be empty.');
      return;
    }

    const updatedStock = parseFloat(editStock) || 0;
    if (updatedStock < 0) {
      triggerAlert('warn', 'Stock balance cannot be negative.');
      return;
    }

    const bagsVal = parseFloat(editNoOfBags);
    const kgVal = parseFloat(editKgPerBag);

    try {
      const itemRef = doc(db, 'rawMaterials', item.id);
      const now = new Date().toISOString();
      
      // Build correction log if stock values are changed manually
      let updatedLogs = item.logs || [];
      if (updatedStock !== item.currentStock) {
        const diff = updatedStock - item.currentStock;
        const correctionLog: InventoryLog = {
          id: `LOG_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          date: now.split('T')[0],
          type: 'correction',
          quantity: Math.abs(diff),
          remarks: `Inventory adjustment from ${item.currentStock} to ${updatedStock}. Reason: Manual stock verification audit.`,
          operator: 'System Audit',
          createdAt: now
        };
        updatedLogs = [correctionLog, ...updatedLogs];
      }

      const updatedItem: RawMaterialItem = {
        ...item,
        name: editName.trim(),
        category: editCategory.trim(),
        currentStock: updatedStock,
        unit: editUnit.trim(),
        remarks: editRemarks.trim(),
        lastUpdated: now,
        logs: updatedLogs.slice(0, 50)
      };

      if (!isNaN(bagsVal) && editNoOfBags.trim() !== '') {
        updatedItem.noOfBags = bagsVal;
      } else {
        delete updatedItem.noOfBags;
      }

      if (!isNaN(kgVal) && editKgPerBag.trim() !== '') {
        updatedItem.kgPerBag = kgVal;
      } else {
        delete updatedItem.kgPerBag;
      }

      await setDoc(itemRef, updatedItem);
      triggerAlert('success', `Material specifications updated successfully.`);
      setEditingItemId(null);
    } catch (err) {
      console.error('Failed to update inline edit', err);
      triggerAlert('warn', 'Failed to save changes to database.');
    }
  };

  // Delete Material Item
  const handleDeleteMaterial = async (item: RawMaterialItem) => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete raw material "${item.name}" from inventory? This action cannot be undone.`)) {
      return;
    }

    try {
      const itemRef = doc(db, 'rawMaterials', item.id);
      await deleteDoc(itemRef);
      triggerAlert('success', `Raw material "${item.name}" has been deleted.`);
      
      // If we are deleting the last visible material item, write a seed marker to Firestore
      // so the system doesn't automatically trigger full default re-seeding.
      const visibleItems = items.filter(i => i.id !== item.id);
      if (visibleItems.length === 0) {
        const markerRef = doc(db, 'rawMaterials', 'seed_marker');
        const markerNow = new Date().toISOString();
        const markerItem: RawMaterialItem = {
          id: 'seed_marker',
          name: 'SEED_MARKER',
          category: 'System',
          currentStock: 0,
          unit: 'pkg',
          remarks: 'Internal marker to prevent automatic database re-seeding',
          lastUpdated: markerNow,
          logs: []
        };
        await setDoc(markerRef, markerItem);
      }

      if (selectedItemForLogs?.id === item.id) {
        setSelectedItemForLogs(null);
      }
    } catch (err) {
      console.error('Delete failed', err);
      triggerAlert('warn', 'Failed to delete record from database.');
    }
  };

  // Delete a specific transaction log entry and adjust inventory stock
  const handleDeleteLog = async (materialId: string, logId: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    if (!window.confirm('Are you sure you want to permanently delete this transaction record? This will adjust the material stock accordingly.')) {
      return;
    }

    try {
      const item = items.find(i => i.id === materialId);
      if (!item) {
        triggerAlert('warn', 'Material item not found.');
        return;
      }

      const logToDelete = item.logs?.find(l => l.id === logId);
      if (!logToDelete) {
        triggerAlert('warn', 'Transaction log not found.');
        return;
      }

      // Calculate adjusted stock
      let adjustedStock = item.currentStock;
      if (logToDelete.type === 'add_stock') {
        adjustedStock = item.currentStock - logToDelete.quantity;
      } else if (logToDelete.type === 'use_stock') {
        adjustedStock = item.currentStock + logToDelete.quantity;
      }

      if (adjustedStock < 0) {
        if (!window.confirm(`Warning: Deleting this log will result in a negative stock level of ${adjustedStock} ${item.unit}. Do you still want to proceed?`)) {
          return;
        }
      }

      const itemRef = doc(db, 'rawMaterials', materialId);
      const now = new Date().toISOString();
      const updatedLogs = (item.logs || []).filter(l => l.id !== logId);

      const updatedItem: RawMaterialItem = {
        ...item,
        currentStock: Math.round(adjustedStock * 100) / 100,
        lastUpdated: now,
        logs: updatedLogs
      };

      if (item.kgPerBag && item.kgPerBag > 0) {
        updatedItem.noOfBags = Math.round((adjustedStock / item.kgPerBag) * 100) / 100;
      } else {
        delete updatedItem.noOfBags;
      }

      await setDoc(itemRef, updatedItem);
      triggerAlert('success', 'Successfully deleted the transaction log and adjusted stock.');
    } catch (err) {
      console.error('Failed to delete transaction log', err);
      triggerAlert('warn', 'Failed to delete transaction log from database.');
    }
  };

  // Start Editing Transaction Log
  const startEditingLog = (log: InventoryLog) => {
    setEditingLogId(log.id);
    setEditLogDate(log.date);
    setEditLogQty(String(log.quantity));
    setEditLogOperator(log.operator || '');
    setEditLogRemarks(log.remarks || '');
    setEditLogReconciliation(log.reconciliation || 'Balanced');
    setEditLogShift(log.shift || 'Day Shift');
    setEditLogStage(log.stage || 'Extrusion / Tape Line');
    setEditLogWastage(log.wastage !== undefined ? String(log.wastage) : '');
  };

  // Cancel Editing Transaction Log
  const cancelEditingLog = () => {
    setEditingLogId(null);
  };

  // Save Transaction Log Edits
  const handleSaveLogEdit = async (materialId: string, logId: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in sandbox mode. Database writes are disabled.');
      return;
    }
    const newQty = parseFloat(editLogQty);
    if (isNaN(newQty) || newQty < 0) {
      triggerAlert('warn', 'Please enter a valid non-negative quantity.');
      return;
    }

    try {
      const item = items.find(i => i.id === materialId);
      if (!item) {
        triggerAlert('warn', 'Material item not found.');
        return;
      }

      const originalLogs = item.logs || [];
      const logIndex = originalLogs.findIndex(l => l.id === logId);
      if (logIndex === -1) {
        triggerAlert('warn', 'Transaction log not found.');
        return;
      }

      const originalLog = originalLogs[logIndex];
      const oldQty = originalLog.quantity;

      // Adjust stock mathematically:
      // If editing add_stock: remove old add, add new add qty
      // If editing use_stock: add old usage back, deduct new usage qty
      let adjustedStock = item.currentStock;
      if (originalLog.type === 'add_stock') {
        adjustedStock = item.currentStock - oldQty + newQty;
      } else if (originalLog.type === 'use_stock') {
        adjustedStock = item.currentStock + oldQty - newQty;
      }

      if (adjustedStock < 0) {
        if (!window.confirm(`Warning: Saving this edit will result in a negative stock level of ${adjustedStock} ${item.unit}. Do you still want to proceed?`)) {
          return;
        }
      }

      const updatedLog: InventoryLog = {
        ...originalLog,
        date: editLogDate,
        quantity: newQty,
        operator: editLogOperator,
        remarks: editLogRemarks,
        reconciliation: editLogReconciliation
      };

      if (originalLog.type === 'use_stock') {
        updatedLog.shift = editLogShift;
        updatedLog.stage = editLogStage;
        if (editLogWastage.trim() !== '') {
          const wNum = parseFloat(editLogWastage);
          if (!isNaN(wNum) && wNum >= 0) {
            updatedLog.wastage = wNum;
          } else {
            delete updatedLog.wastage;
          }
        } else {
          delete updatedLog.wastage;
        }
      }

      const updatedLogs = [...originalLogs];
      updatedLogs[logIndex] = updatedLog;

      const itemRef = doc(db, 'rawMaterials', materialId);
      const now = new Date().toISOString();

      const updatedItem: RawMaterialItem = {
        ...item,
        currentStock: Math.round(adjustedStock * 100) / 100,
        lastUpdated: now,
        logs: updatedLogs
      };

      if (item.kgPerBag && item.kgPerBag > 0) {
        updatedItem.noOfBags = Math.round((adjustedStock / item.kgPerBag) * 100) / 100;
      } else {
        delete updatedItem.noOfBags;
      }

      await setDoc(itemRef, updatedItem);
      triggerAlert('success', 'Successfully updated transaction record and adjusted inventory stock.');
      setEditingLogId(null);
    } catch (err) {
      console.error('Failed to save log edit', err);
      triggerAlert('warn', 'Failed to save transaction edits to cloud database.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full select-none" id="raw-materials-inventory-page">
      {/* 1. TOP HERO TITLE BANNER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 text-white p-6 rounded-3xl shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-6">
          <Package size={200} className="text-white" />
        </div>
        <div className="space-y-1 z-10">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase flex items-center gap-2">
            <Package className="text-amber-400" size={26} />
            Raw Materials & Stock Inventory
          </h2>
          <p className="text-xs text-slate-350 max-w-xl font-medium">
            Manage PP granules, calcium carbonate fillers, LDPE elastomeric polymers, UV stabilisers, and TPT additives for the PP tape fabrication plant.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-2.5 z-10">
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 text-xs font-black rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Register New Material</span>
          </button>
        </div>
      </div>

      {/* 2. STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Total Varieties */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Registered Materials</span>
            <span className="p-2 bg-slate-100 text-slate-700 rounded-xl">
              <Package size={16} />
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{metrics.totalVarieties} Varieties</h3>
            <p className="text-xs text-slate-450 font-bold uppercase tracking-wider">Active stock sheets</p>
          </div>
        </div>

        {/* Metric 2: Total Stock in Store */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Total Bulk Stock</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <h3 className="text-xl sm:text-2xl font-black text-indigo-900 font-mono tracking-tight">{(metrics.totalStockKgs / 1000).toFixed(2)} Tons</h3>
            <p className="text-xs text-indigo-650 font-extrabold uppercase tracking-wider">{metrics.totalStockKgs.toLocaleString()} kgs total in-store</p>
          </div>
        </div>

        {/* Metric 3: Today's Deductions */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Today's Plant Usage</span>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-xl animate-pulse">
              <TrendingDown size={16} />
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <h3 className="text-xl sm:text-2xl font-black text-rose-600 font-mono tracking-tight">{metrics.todayUsageKgs.toLocaleString()} kg</h3>
            <p className="text-xs text-rose-500 font-extrabold uppercase tracking-wider">Auto-deductions today</p>
          </div>
        </div>

        {/* Metric 4: Low Stock Warnings */}
        <div className={`border p-5 rounded-3xl shadow-sm hover:shadow-md transition-all ${metrics.lowStockCount > 0 ? 'bg-amber-50/70 border-amber-200 shadow-amber-100/10' : 'bg-white border-slate-200/85'}`}>
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Restock Warning Alerts</span>
            <span className={`p-2 rounded-xl ${metrics.lowStockCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
              <AlertCircle size={16} />
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <h3 className={`text-xl sm:text-2xl font-black tracking-tight font-mono ${metrics.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.lowStockCount} {metrics.lowStockCount === 1 ? 'Item' : 'Items'}
            </h3>
            <p className="text-xs text-slate-450 font-bold uppercase tracking-wider">Below warning threshold (&lt;2t)</p>
          </div>
        </div>
      </div>

      {/* 3. FILTER BAR */}
      <div className="bg-white p-4.5 border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center select-none">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search material variety, remarks..."
            className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-xl text-xs font-semibold focus:outline-none transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-800 cursor-pointer">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Category Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs">
            <Filter size={13} className="text-slate-450" />
            <span className="text-slate-450 uppercase tracking-wider text-[10px]">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent border-none pr-2 text-slate-700 font-extrabold focus:outline-none cursor-pointer"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Stock Level Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs">
            <span className="text-slate-450 uppercase tracking-wider text-[10px]">Stock Status:</span>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="bg-transparent border-none pr-2 text-slate-700 font-extrabold focus:outline-none cursor-pointer"
            >
              <option value="All">All Levels</option>
              <option value="Low Stock">Low Stock (&lt;2t)</option>
              <option value="Normal">Normal Stock (&ge;2t)</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(categoryFilter !== 'All' || stockStatusFilter !== 'All' || searchQuery !== '') && (
            <button
              onClick={() => {
                setCategoryFilter('All');
                setStockStatusFilter('All');
                setSearchQuery('');
              }}
              className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 hover:text-slate-900 text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
              title="Reset Filters"
            >
              <RefreshCw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. MAIN LAYOUT: TABLES & HISTORY LEDGER PANEL */}
      <div className="space-y-6">
        {/* LEFT/MAIN TABLE CARD (stretched to full width) */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Package size={16} className="text-slate-500" />
              Raw Material Stock Sheet ({filteredItems.length} listed)
            </h3>
            <span className="text-[10px] font-mono text-slate-450 font-bold uppercase tracking-wider">Autocommit to Google Cloud Database</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-450 font-semibold space-y-3">
              <RefreshCw className="animate-spin mx-auto text-amber-500" size={28} />
              <p className="text-xs uppercase tracking-wider">Streaming real-time inventory ledger state...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium space-y-2">
              <AlertCircle className="mx-auto text-slate-350" size={36} />
              <p className="text-sm font-bold text-slate-700">No raw material matching filters</p>
              <p className="text-xs text-slate-400">Try adjusting your search queries or category filters above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-100 text-[11px] font-black uppercase tracking-wider select-none border-b border-slate-800">
                    <th className="py-4.5 px-6">Material Details</th>
                    <th className="py-4.5 px-6">Category</th>
                    <th className="py-4.5 px-6 text-right whitespace-nowrap min-w-[170px]">In-Store Stock</th>
                    <th className="py-4.5 px-6 text-center">Quick Stock Log</th>
                    <th className="py-4.5 px-6 min-w-[200px] max-w-[320px]">Remarks</th>
                    <th className="py-4.5 px-6 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {filteredItems.map((item) => {
                    const isEditing = editingItemId === item.id;
                    const isLow = item.currentStock < 2000;
                    const isSelected = selectedItemForLogs?.id === item.id;

                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-amber-50/20' : ''}`}
                      >
                        {/* Column 1: Material Details */}
                        <td className="py-4.5 px-6">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-lg text-xs font-bold"
                            />
                          ) : (
                            <div className="space-y-1">
                              <span 
                                onClick={() => setSelectedItemForLogs(item)}
                                className="font-extrabold text-slate-900 text-[13px] hover:text-amber-600 hover:underline cursor-pointer block leading-snug"
                              >
                                {item.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">ID: {item.id}</span>
                                <span className="text-[9.5px] text-indigo-500 font-bold block" id={`reg-date-${item.id}`}>
                                  Setup: {formatDateToDMY(item.registrationDate || (item.logs && item.logs.length > 0 ? item.logs[item.logs.length - 1].date : item.lastUpdated?.split('T')[0]))}
                                </span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Column 2: Category */}
                        <td className="py-4.5 px-6">
                          {isEditing ? (
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="h-9 px-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-lg text-xs font-bold"
                            >
                              <option value="PP Granules">PP Granules</option>
                              <option value="Filler">Filler</option>
                              <option value="LDPE">LDPE</option>
                              <option value="TPT">TPT</option>
                              <option value="UV Stabilizer">UV Stabilizer</option>
                              <option value="Others">Others</option>
                            </select>
                          ) : (
                            <span className="px-3 py-1 bg-slate-100 text-slate-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-slate-200">
                              {item.category}
                            </span>
                          )}
                        </td>

                        {/* Column 3: In-Store Stock */}
                        <td className="py-4.5 px-6 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="space-y-1.5 flex flex-col items-end">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  value={editStock}
                                  onChange={(e) => setEditStock(e.target.value)}
                                  className="w-20 h-8 px-2 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-lg text-xs text-right font-bold"
                                />
                                <input
                                  type="text"
                                  value={editUnit}
                                  onChange={(e) => setEditUnit(e.target.value)}
                                  className="w-12 h-8 px-2 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-1 text-[10px]">
                                <input
                                  type="number"
                                  placeholder="Bags"
                                  value={editNoOfBags}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditNoOfBags(val);
                                    const bags = parseFloat(val);
                                    const kg = parseFloat(editKgPerBag);
                                    if (!isNaN(bags) && !isNaN(kg) && bags > 0 && kg > 0) {
                                      setEditStock(String(bags * kg));
                                    }
                                  }}
                                  className="w-14 h-6 px-1.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded text-right font-semibold"
                                  title="Number of Bags"
                                />
                                <span className="text-slate-400">×</span>
                                <input
                                  type="number"
                                  placeholder="kg/bag"
                                  value={editKgPerBag}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditKgPerBag(val);
                                    const bags = parseFloat(editNoOfBags);
                                    const kg = parseFloat(val);
                                    if (!isNaN(bags) && !isNaN(kg) && bags > 0 && kg > 0) {
                                      setEditStock(String(bags * kg));
                                    }
                                  }}
                                  className="w-14 h-6 px-1.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded text-right font-semibold"
                                  title="Kg per Bag"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className={`text-[15px] font-black font-mono tracking-tight ${isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                                  {item.currentStock.toLocaleString()} {item.unit}
                                </span>
                                {item.noOfBags !== undefined && item.noOfBags > 0 && item.kgPerBag !== undefined && item.kgPerBag > 0 && (
                                  <span className="text-[11px] text-slate-500 font-extrabold font-mono">
                                    ({item.noOfBags} bags × {item.kgPerBag} kg)
                                  </span>
                                )}
                              </div>
                              {isLow && (
                                <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 border border-amber-200 rounded inline-block text-center ml-auto">
                                  LOW STOCK
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Column 4: Quick Stock Log Operations */}
                        <td className="py-4.5 px-6 text-center">
                          {!isEditing && (
                            <div className="flex justify-center items-center gap-2">
                              <button
                                onClick={() => {
                                  setActiveActionItem(item);
                                  setActionType('add');
                                  setActionQty('');
                                  setActionDate(new Date().toISOString().split('T')[0]);
                                  setActionRemarks('');
                                  setActionReconciliation('Balanced');
                                }}
                                className="h-8 px-3 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 font-extrabold uppercase tracking-wider rounded-xl transition-all border border-slate-200 hover:border-emerald-200 cursor-pointer flex items-center gap-1 text-[10px] shadow-2xs"
                                title="Replenish stock"
                              >
                                <PlusCircle size={14} />
                                <span>Add</span>
                              </button>
                              <button
                                onClick={() => {
                                  setActiveActionItem(item);
                                  setActionType('deduct');
                                  setActionQty('');
                                  setActionDate(new Date().toISOString().split('T')[0]);
                                  setActionShift('Day Shift');
                                  setActionRemarks('');
                                  setActionStage('Extrusion / Tape Line');
                                  setActionWastage('');
                                  setActionReconciliation('Balanced');
                                }}
                                className="h-8 px-3 hover:bg-rose-50 text-rose-500 hover:text-rose-600 font-extrabold uppercase tracking-wider rounded-xl transition-all border border-slate-200 hover:border-rose-200 cursor-pointer flex items-center gap-1 text-[10px] shadow-2xs"
                                title="Log today's usage/disbursal"
                              >
                                <MinusCircle size={14} />
                                <span>Use</span>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Column 5: Remarks */}
                        <td className="py-4.5 px-6 min-w-[200px] max-w-[320px] whitespace-normal break-words">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editRemarks}
                              onChange={(e) => setEditRemarks(e.target.value)}
                              className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-lg text-xs"
                            />
                          ) : (
                            <span className="text-slate-600 text-xs leading-relaxed block font-medium">
                              {item.remarks || <span className="text-slate-350 italic">No remarks recorded</span>}
                            </span>
                          )}
                        </td>

                        {/* Column 6: Actions */}
                        <td className="py-4.5 px-6 pr-6 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveInlineEdit(item)}
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-all border border-emerald-100 cursor-pointer"
                                  title="Save material details"
                                >
                                  <Check size={14} strokeWidth={2.5} />
                                </button>
                                <button
                                  onClick={() => setEditingItemId(null)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-all border border-slate-200 cursor-pointer"
                                  title="Cancel edit"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setSelectedItemForLogs(item)}
                                  className={`p-1.5 rounded-lg transition-all border cursor-pointer ${isSelected ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-450'}`}
                                  title="View audit logs"
                                >
                                  <History size={13} />
                                </button>
                                <button
                                  onClick={() => startInlineEdit(item)}
                                  className="p-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-all cursor-pointer"
                                  title="Edit Specifications"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteMaterial(item)}
                                  className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 text-slate-500 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                                  title="Delete material variety"
                                >
                                  <Trash2 size={13} />
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
          )}
        </div>

        {/* PERSISTENT DAILY/SHIFT-WISE MATERIAL AUDIT LEDGER */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-6 space-y-5">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-150 select-none">
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="text-amber-500" size={20} />
                Daily Material Audit Ledger
              </h3>
              <p className="text-xs text-slate-500">
                Opening stock, plant consumption, process wastage, and final closing balances for <strong className="text-slate-800 font-mono font-black">{ledgerAuditDate}</strong>
              </p>
            </div>
            
            {/* Date & Shift Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl shadow-2xs">
                <Calendar size={14} className="text-slate-500" />
                <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Date:</span>
                <input
                  type="date"
                  value={ledgerAuditDate}
                  onChange={(e) => setLedgerAuditDate(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-800 outline-none focus:ring-0 cursor-pointer font-mono"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl shadow-2xs">
                <Activity size={14} className="text-slate-500" />
                <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Shift:</span>
                <select
                  value={ledgerAuditShift}
                  onChange={(e) => setLedgerAuditShift(e.target.value as 'All' | 'Day Shift' | 'Night Shift')}
                  className="bg-transparent text-xs font-black text-slate-800 outline-none focus:ring-0 cursor-pointer"
                >
                  <option value="All">All Shifts</option>
                  <option value="Day Shift">Day Shift</option>
                  <option value="Night Shift">Night Shift</option>
                </select>
              </div>
            </div>
          </div>

          {/* TWO SEPARATE BUTTONS UNDER THE MATERIAL AUDIT LEDGER */}
          <div className="flex flex-wrap items-center gap-3.5 py-1">
            <button
              onClick={() => {
                setAddHistoryMonth('All');
                setAddHistoryYear(String(new Date().getFullYear()));
                setShowAddHistoryModal(true);
              }}
              className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-sm shadow-emerald-200/50 uppercase tracking-wider"
              title="View History of Stock Additions"
            >
              <History size={14} strokeWidth={2.5} />
              <span>Add History Ledger</span>
            </button>
            <button
              onClick={() => {
                setUseHistoryMonth('All');
                setUseHistoryYear(String(new Date().getFullYear()));
                setShowUseHistoryModal(true);
              }}
              className="h-10 px-5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-sm shadow-rose-200/50 uppercase tracking-wider"
              title="View History of Stock Usage / Deductions"
            >
              <History size={14} strokeWidth={2.5} />
              <span>Use History Ledger</span>
            </button>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-black text-slate-100 uppercase tracking-wider select-none">
                  <th className="py-4 px-5 pl-6">Material Name</th>
                  <th className="py-4 px-5">Category</th>
                  <th className="py-4 px-5 text-right">Opening Stock</th>
                  <th className="py-4 px-5 text-right font-black">Consumption</th>
                  <th className="py-4 px-5 text-right">Wastage</th>
                  <th className="py-4 px-5 text-right">Closing Stock</th>
                  <th className="py-4 px-5 pl-8">Consumption Remarks / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-xs">
                {dailyAuditLedgerData.map((row) => {
                  if (!row) return null;
                  const hasConsumed = row.consumption > 0;
                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-50/50 transition-colors ${hasConsumed ? 'bg-amber-50/10' : ''}`}
                    >
                      <td className="py-4 px-5 pl-6 font-black text-slate-800 text-[13px]">{row.name}</td>
                      <td className="py-4 px-5">
                        <span className="px-3 py-1 text-[10px] font-black text-slate-700 bg-slate-100 rounded-md uppercase tracking-wider border border-slate-200">
                          {row.category}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right font-mono font-bold text-slate-700 text-[13px]">
                        {row.openingStock.toLocaleString()} {row.unit}
                      </td>
                      <td className={`py-4 px-5 text-right font-mono font-black text-[13px] ${hasConsumed ? 'text-rose-600' : 'text-slate-400'}`}>
                        {hasConsumed ? `-${row.consumption.toLocaleString()}` : '0'} {row.unit}
                      </td>
                      <td className={`py-4 px-5 text-right font-mono font-bold text-[13px] ${row.wastage > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                        {row.wastage > 0 ? `${row.wastage.toLocaleString()} kg` : '—'}
                      </td>
                      <td className="py-4 px-5 text-right font-mono font-black text-slate-900 text-[13px]">
                        {row.finalStock.toLocaleString()} {row.unit}
                      </td>
                      <td className="py-4 px-5 pl-8 max-w-[240px] truncate text-xs text-slate-500 font-medium italic">
                        {row.remarks || <span className="text-slate-300">No remarks</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. MODAL: REGISTER NEW RAW MATERIAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5">
                  <PlusCircle size={16} className="text-amber-400" />
                  Register Raw Material
                </h3>
                <p className="text-[10px] text-slate-350">Create an active stock card in the ledger database</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddNewMaterial} className="p-5 space-y-4">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Material Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. PP Granules Raffia Grade B, LDPE Masterbatch"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all"
                />
              </div>

              {/* Grid: Category & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    <option value="PP Granules">PP Granules</option>
                    <option value="Filler">Filler (Calcium Carbonate)</option>
                    <option value="LDPE">LDPE</option>
                    <option value="TPT">TPT</option>
                    <option value="UV Stabilizer">UV Stabilizer</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Stock Unit *</label>
                  <input
                    type="text"
                    required
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="e.g. kg, bags, tons"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all"
                  />
                </div>
              </div>

              {/* Grid: Kg per Bag & No of Bags */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Number of Bags</label>
                  <input
                    type="number"
                    value={newNoOfBags}
                    onChange={(e) => setNewNoOfBags(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Kg per Bag</label>
                  <input
                    type="number"
                    value={newKgPerBag}
                    onChange={(e) => setNewKgPerBag(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all"
                  />
                </div>
              </div>

              {/* Initial Stock & Registration Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Initial Stock Balance</label>
                  <input
                    type="number"
                    required
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Registration / Setup Date *</label>
                  <input
                    type="date"
                    required
                    value={newMaterialDate}
                    onChange={(e) => setNewMaterialDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Technical Remarks / Notes</label>
                <textarea
                  value={newRemarks}
                  onChange={(e) => setNewRemarks(e.target.value)}
                  placeholder="e.g. MFI, supplier name, plant line application notes..."
                  className="w-full h-20 p-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-medium transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  {isSubmittingNew ? (
                    <RefreshCw className="animate-spin text-white" size={14} />
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      <span>Create Material</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: QUICK STOCK ACTION (ADD OR DEDUCT USAGE) */}
      {activeActionItem && actionType && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className={`p-4.5 text-white flex justify-between items-center ${actionType === 'add' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <div className="space-y-0.5">
                <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  {actionType === 'add' ? <PlusCircle size={15} /> : <MinusCircle size={15} />}
                  {actionType === 'add' ? 'Add Stock' : 'Deduct Stock Usage'}
                </h3>
                <p className="text-[10px] text-white/80 leading-none truncate max-w-[340px]">For: {activeActionItem.name}</p>
              </div>
              <button 
                onClick={() => {
                  setActiveActionItem(null);
                  setActionType(null);
                }}
                className="p-1 hover:bg-white/10 rounded-lg text-white/90 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleQuickActionSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-0.5 text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">CURRENT STORE BALANCE</span>
                <span className="text-sm font-black text-slate-700 font-mono">
                  {activeActionItem.currentStock.toLocaleString()} {activeActionItem.unit}
                </span>
              </div>

              {/* Grid: Qty and Date */}
              <div className="grid grid-cols-2 gap-4">
                {/* Qty */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                    {actionType === 'add' ? 'Quantity Added *' : 'Quantity Used *'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      autoFocus
                      value={actionQty}
                      onChange={(e) => setActionQty(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full h-10 pl-3 pr-12 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-bold font-mono transition-all"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 font-sans uppercase">
                      {activeActionItem.unit}
                    </span>
                  </div>
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all"
                  />
                </div>
              </div>

              {/* Deductions-Only: Shift & Stage */}
              {actionType === 'deduct' && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Shift Dropdown */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Plant Shift *</label>
                    <select
                      value={actionShift}
                      onChange={(e) => setActionShift(e.target.value as 'Day Shift' | 'Night Shift')}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      <option value="Day Shift">Day Shift</option>
                      <option value="Night Shift">Night Shift</option>
                    </select>
                  </div>

                  {/* Stage Dropdown */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Production Stage *</label>
                    <select
                      value={actionStage}
                      onChange={(e) => setActionStage(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      <option value="Extrusion / Tape Line">Extrusion / Tape Line</option>
                      <option value="Mixing / Blending">Mixing / Blending</option>
                      <option value="Weaving Loom">Weaving Loom</option>
                      <option value="Lamination">Lamination</option>
                      <option value="Bag Conversion">Bag Conversion</option>
                      <option value="Printing">Printing</option>
                      <option value="Packaging">Packaging</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Optional Wastage and Reconciliation Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Wastage (Deductions only) or Info for Additions */}
                {actionType === 'deduct' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                      Wastage (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={actionWastage}
                        onChange={(e) => setActionWastage(e.target.value)}
                        placeholder="e.g. 12.5"
                        className="w-full h-10 pl-3 pr-10 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold font-mono transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-450">
                        kg
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                      Ref Supplier Lot (Opt)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Reliance, Lot #103"
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all"
                    />
                  </div>
                )}

                {/* Reconciliation Status */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                    Reconciliation Status
                  </label>
                  <input
                    type="text"
                    required
                    value={actionReconciliation}
                    onChange={(e) => setActionReconciliation(e.target.value)}
                    placeholder="e.g. Balanced, Audited"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold transition-all"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Remarks / Notes</label>
                <input
                  type="text"
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  placeholder={actionType === 'add' ? 'e.g. Received replenishment from vendor' : 'e.g. Disbursed for shift production runs'}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white focus:outline-none rounded-xl text-xs font-medium transition-all"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveActionItem(null);
                    setActionType(null);
                  }}
                  className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-650 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAction}
                  className={`flex-1 h-10 text-white text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer ${
                    actionType === 'add' ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400' : 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400'
                  }`}
                >
                  {isSubmittingAction ? (
                    <RefreshCw className="animate-spin text-white" size={14} />
                  ) : (
                    <>
                      <Check size={14} strokeWidth={2.5} />
                      <span>{actionType === 'add' ? 'Confirm Addition' : 'Confirm Deduction'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. POPUP MODAL: ADDITIONS HISTORY LEDGER */}
      {showAddHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-250 w-full ${editingLogId ? 'max-w-7xl lg:max-w-[92vw]' : 'max-w-4xl'} max-h-[85vh] overflow-hidden flex flex-col transform transition-all duration-300 animate-in fade-in zoom-in-95`}>
            {/* Header */}
            <div className="bg-emerald-700 text-white p-5 flex justify-between items-center select-none">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <History size={16} />
                  Raw Material Additions History Ledger
                </h3>
                <p className="text-[10px] text-emerald-100">All recorded replenishments and restock transactions</p>
              </div>
              <button 
                onClick={() => setShowAddHistoryModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-emerald-100 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-50 border-b border-slate-150 p-4 flex flex-wrap items-center justify-between gap-4 select-none">
              <span className="text-xs font-bold text-slate-500">
                Found {filteredAddHistoryLogs.length} addition log(s)
              </span>
              
              <div className="flex items-center gap-3">
                {/* Month Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Month:</span>
                  <select
                    value={addHistoryMonth}
                    onChange={(e) => setAddHistoryMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="All">All Months</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>

                {/* Year Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Year:</span>
                  <select
                    value={addHistoryYear}
                    onChange={(e) => setAddHistoryYear(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="All">All Years</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List/Table */}
            <div className="flex-1 overflow-y-auto p-5">
              {filteredAddHistoryLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <History className="mx-auto text-slate-300" size={32} />
                  <p className="text-xs font-bold text-slate-600">No Addition Logs Found</p>
                  <p className="text-[11px] text-slate-400">Try adjusting your Month or Year filter settings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider select-none">
                        <th className="p-3 pl-4">Date</th>
                        <th className="p-3">Material Name</th>
                        <th className="p-3 text-right">Qty Added</th>
                        <th className="p-3 text-center">Reconciliation Status</th>
                        <th className="p-3">Operator</th>
                        <th className="p-3 pl-6">Remarks / Notes</th>
                        <th className="p-3 text-center pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60 text-xs text-slate-650">
                      {filteredAddHistoryLogs.map((entry) => {
                        const isEditingLog = editingLogId === entry.log.id;
                        return (
                          <tr key={entry.log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 pl-4 font-semibold font-mono text-slate-600 whitespace-nowrap">
                              {isEditingLog ? (
                                <input
                                  type="date"
                                  value={editLogDate}
                                  onChange={(e) => setEditLogDate(e.target.value)}
                                  className="w-24 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-mono font-semibold"
                                />
                              ) : (
                                formatDateToDMY(entry.log.date)
                              )}
                            </td>
                            <td className="p-3 font-bold text-slate-800">{entry.materialName}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600">
                              {isEditingLog ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    value={editLogQty}
                                    onChange={(e) => setEditLogQty(e.target.value)}
                                    className="w-16 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-right text-xs font-mono font-semibold"
                                  />
                                  <span className="text-[10px]">{entry.materialUnit}</span>
                                </div>
                              ) : (
                                `+${entry.log.quantity.toLocaleString()} ${entry.materialUnit}`
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isEditingLog ? (
                                <select
                                  value={editLogReconciliation}
                                  onChange={(e) => setEditLogReconciliation(e.target.value)}
                                  className="px-1 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 rounded text-[10px] font-bold text-slate-700 cursor-pointer"
                                >
                                  <option value="Balanced">Balanced</option>
                                  <option value="Audited">Audited</option>
                                  <option value="Pending">Pending</option>
                                  <option value="Correction">Correction</option>
                                </select>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                                  {entry.log.reconciliation || 'Balanced'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-medium text-slate-600">
                              {isEditingLog ? (
                                <input
                                  type="text"
                                  value={editLogOperator}
                                  onChange={(e) => setEditLogOperator(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-semibold"
                                />
                              ) : (
                                entry.log.operator || 'System'
                              )}
                            </td>
                            <td className="p-3 pl-6 italic text-slate-500 max-w-[200px] truncate" title={entry.log.remarks}>
                              {isEditingLog ? (
                                <input
                                  type="text"
                                  value={editLogRemarks}
                                  onChange={(e) => setEditLogRemarks(e.target.value)}
                                  className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-medium"
                                  placeholder="Remarks..."
                                />
                              ) : (
                                entry.log.remarks || '—'
                              )}
                            </td>
                            <td className="p-3 text-center pr-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {isEditingLog ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveLogEdit(entry.materialId, entry.log.id)}
                                      className="p-1 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 text-emerald-600 hover:text-emerald-800 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Save changes"
                                    >
                                      <Check size={13} strokeWidth={2.5} />
                                    </button>
                                    <button
                                      onClick={cancelEditingLog}
                                      className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Cancel"
                                    >
                                      <X size={13} strokeWidth={2.5} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEditingLog(entry.log)}
                                      className="p-1 hover:bg-amber-50 border border-transparent hover:border-amber-100 text-slate-400 hover:text-amber-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Edit transaction record"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLog(entry.materialId, entry.log.id)}
                                      className="p-1 hover:bg-rose-50 border border-transparent hover:border-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Delete transaction record"
                                    >
                                      <Trash2 size={13} />
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
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-150 p-4.5 flex justify-end">
              <button
                onClick={() => setShowAddHistoryModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Close Ledger Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. POPUP MODAL: DEDUCTIONS HISTORY LEDGER */}
      {showUseHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-250 w-full ${editingLogId ? 'max-w-7xl lg:max-w-[95vw]' : 'max-w-5xl'} max-h-[85vh] overflow-hidden flex flex-col transform transition-all duration-300 animate-in fade-in zoom-in-95`}>
            {/* Header */}
            <div className="bg-rose-700 text-white p-5 flex justify-between items-center select-none">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <History size={16} />
                  Raw Material Usage & Deductions History Ledger
                </h3>
                <p className="text-[10px] text-rose-100">All recorded production floor disbursals and process usages</p>
              </div>
              <button 
                onClick={() => setShowUseHistoryModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-rose-100 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-50 border-b border-slate-150 p-4 flex flex-wrap items-center justify-between gap-4 select-none">
              <span className="text-xs font-bold text-slate-500">
                Found {filteredUseHistoryLogs.length} usage deduction log(s)
              </span>
              
              <div className="flex items-center gap-3">
                {/* Month Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Month:</span>
                  <select
                    value={useHistoryMonth}
                    onChange={(e) => setUseHistoryMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="All">All Months</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>

                {/* Year Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Year:</span>
                  <select
                    value={useHistoryYear}
                    onChange={(e) => setUseHistoryYear(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="All">All Years</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List/Table */}
            <div className="flex-1 overflow-y-auto p-5">
              {filteredUseHistoryLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <History className="mx-auto text-slate-300" size={32} />
                  <p className="text-xs font-bold text-slate-600">No Deduction Logs Found</p>
                  <p className="text-[11px] text-slate-400">Try adjusting your Month or Year filter settings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left border-collapse font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider select-none">
                        <th className="p-3 pl-4">Date</th>
                        <th className="p-3">Material Name</th>
                        <th className="p-3 text-right">Quantity Used</th>
                        <th className="p-3">Shift</th>
                        <th className="p-3">Stage</th>
                        <th className="p-3 text-right">Wastage</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3">Operator</th>
                        <th className="p-3 pl-5">Remarks / Details</th>
                        <th className="p-3 text-center pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60 text-xs text-slate-655">
                      {filteredUseHistoryLogs.map((entry) => {
                        const isEditingLog = editingLogId === entry.log.id;
                        return (
                          <tr key={entry.log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 pl-4 font-semibold font-mono text-slate-600 whitespace-nowrap">
                              {isEditingLog ? (
                                <input
                                  type="date"
                                  value={editLogDate}
                                  onChange={(e) => setEditLogDate(e.target.value)}
                                  className="w-24 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-mono font-semibold"
                                />
                              ) : (
                                formatDateToDMY(entry.log.date)
                              )}
                            </td>
                            <td className="p-3 font-bold text-slate-800">{entry.materialName}</td>
                            <td className="p-3 text-right font-mono font-bold text-rose-600">
                              {isEditingLog ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    value={editLogQty}
                                    onChange={(e) => setEditLogQty(e.target.value)}
                                    className="w-16 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-right text-xs font-mono font-semibold"
                                  />
                                  <span className="text-[10px]">{entry.materialUnit}</span>
                                </div>
                              ) : (
                                `-${entry.log.quantity.toLocaleString()} ${entry.materialUnit}`
                              )}
                            </td>
                            <td className="p-3 font-semibold text-slate-700">
                              {isEditingLog ? (
                                <select
                                  value={editLogShift}
                                  onChange={(e) => setEditLogShift(e.target.value as any)}
                                  className="px-1 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 rounded text-xs font-bold text-slate-700 cursor-pointer"
                                >
                                  <option value="Day Shift">Day Shift</option>
                                  <option value="Night Shift">Night Shift</option>
                                </select>
                              ) : (
                                entry.log.shift || '—'
                              )}
                            </td>
                            <td className="p-3 text-slate-500 font-medium">
                              {isEditingLog ? (
                                <input
                                  type="text"
                                  value={editLogStage}
                                  onChange={(e) => setEditLogStage(e.target.value)}
                                  className="w-24 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-semibold"
                                />
                              ) : (
                                entry.log.stage || '—'
                              )}
                            </td>
                            <td className="p-3 text-right font-mono text-orange-600 font-bold">
                              {isEditingLog ? (
                                <div className="flex items-center justify-end gap-0.5">
                                  <input
                                    type="number"
                                    step="any"
                                    value={editLogWastage}
                                    onChange={(e) => setEditLogWastage(e.target.value)}
                                    className="w-12 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-right text-xs font-mono font-semibold"
                                  />
                                  <span className="text-[10px]">kg</span>
                                </div>
                              ) : (
                                entry.log.wastage ? `${entry.log.wastage} kg` : '0 kg'
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isEditingLog ? (
                                <select
                                  value={editLogReconciliation}
                                  onChange={(e) => setEditLogReconciliation(e.target.value)}
                                  className="px-1 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 rounded text-[10px] font-bold text-slate-700 cursor-pointer"
                                >
                                  <option value="Audited">Audited</option>
                                  <option value="Balanced">Balanced</option>
                                  <option value="Pending">Pending</option>
                                </select>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                                  {entry.log.reconciliation || 'Audited'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-medium text-slate-600">
                              {isEditingLog ? (
                                <input
                                  type="text"
                                  value={editLogOperator}
                                  onChange={(e) => setEditLogOperator(e.target.value)}
                                  className="w-16 px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-semibold"
                                />
                              ) : (
                                entry.log.operator || 'System'
                              )}
                            </td>
                            <td className="p-3 pl-5 italic text-slate-500 max-w-[160px] truncate" title={entry.log.remarks}>
                              {isEditingLog ? (
                                <input
                                  type="text"
                                  value={editLogRemarks}
                                  onChange={(e) => setEditLogRemarks(e.target.value)}
                                  className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-250 focus:border-amber-400 focus:bg-white rounded text-xs font-medium"
                                  placeholder="Remarks..."
                                />
                              ) : (
                                entry.log.remarks || '—'
                              )}
                            </td>
                            <td className="p-3 text-center pr-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {isEditingLog ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveLogEdit(entry.materialId, entry.log.id)}
                                      className="p-1 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 text-emerald-600 hover:text-emerald-800 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Save changes"
                                    >
                                      <Check size={13} strokeWidth={2.5} />
                                    </button>
                                    <button
                                      onClick={cancelEditingLog}
                                      className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Cancel"
                                    >
                                      <X size={13} strokeWidth={2.5} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEditingLog(entry.log)}
                                      className="p-1 hover:bg-amber-50 border border-transparent hover:border-amber-100 text-slate-400 hover:text-amber-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Edit transaction record"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLog(entry.materialId, entry.log.id)}
                                      className="p-1 hover:bg-rose-50 border border-transparent hover:border-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center"
                                      title="Delete transaction record"
                                    >
                                      <Trash2 size={13} />
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
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-150 p-4.5 flex justify-end">
              <button
                onClick={() => setShowUseHistoryModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Close Ledger Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
