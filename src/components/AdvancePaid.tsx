/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { Wallet, Calendar as CalendarIcon, Plus, Info, Landmark, History, Coins, Utensils, Coffee, Receipt, UserCheck, Edit, Trash2, Check, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Employee } from '../types';

export interface CanteenFoodBill {
  id: string;
  challanNo: string;
  issuedBy: string;
  mealType: 'Lunch' | 'Dinner';
  noOfMeals: number;
  amount: number;
  date: string;
  monthYear: string;
  remarks?: string;
}

interface AdvancePaidProps {
  employees: Employee[];
  allMonthlyOverrides: Record<string, Record<string, { 
    workingDays?: number;
    fullDaysAbsent?: number;
    advancePayment?: number;
    advanceRemarks?: string;
    advanceDate?: string;
    workingHours?: number;
    absentHours?: number;
    absentMinutes?: number;
    monthlySalary?: number;
    foodBalance?: number;
    foodRemarks?: string;
    foodDate?: string;
  }>>;
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
  ledgerMonth: number; // 1-indexed (e.g. 5 is May)
  ledgerYear: number;
  setAllMonthlyOverrides?: React.Dispatch<React.SetStateAction<any>>;
  setLedgerMonth?: (m: number) => void;
  setLedgerYear?: (y: number) => void;
}

export default function AdvancePaid({
  employees,
  allMonthlyOverrides,
  triggerAlert,
  viewOnly = false,
  ledgerMonth,
  ledgerYear,
  setAllMonthlyOverrides,
  setLedgerMonth,
  setLedgerYear
}: AdvancePaidProps) {
  // --- STATE FOR ADVANCE PAID ---
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [advanceAmount, setAdvanceAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedMonth, setSelectedMonth] = useState<number>(ledgerMonth - 1); // 0-indexed for representation
  const [selectedYear, setSelectedYear] = useState<number>(ledgerYear);
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState(false);

  // --- STATE FOR SORTING ADVANCES ---
  const [sortField, setSortField] = useState<'date' | 'employeeId' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- STATE FOR SORTING FOOD BILLS ---
  const [foodSortDirection, setFoodSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- STATE FOR FOOD BILL ---
  const [challanNo, setChallanNo] = useState<string>('');
  const [challanIssuedBy, setChallanIssuedBy] = useState<string>('');
  const [mealType, setMealType] = useState<'Lunch' | 'Dinner'>('Lunch');
  const [noOfMeals, setNoOfMeals] = useState<string>('');
  const [foodRemarks, setFoodRemarks] = useState<string>('');
  const [selectedFoodDay, setSelectedFoodDay] = useState<number>(new Date().getDate());
  const [selectedFoodMonth, setSelectedFoodMonth] = useState<number>(ledgerMonth - 1); // 0-indexed for representation
  const [selectedFoodYear, setSelectedFoodYear] = useState<number>(ledgerYear);
  const [isSubmittingFood, setIsSubmittingFood] = useState(false);
  const [canteenFoodBills, setCanteenFoodBills] = useState<CanteenFoodBill[]>([]);

  // --- STATE FOR ADVANCED SEARCHING ---
  const [advanceSearch, setAdvanceSearch] = useState<string>('');
  const [showAdvanceSug, setShowAdvanceSug] = useState<boolean>(false);

  // --- STATE FOR EDITING & DELETIONS ---
  const [editingAdvance, setEditingAdvance] = useState<{
    employeeId: string;
    monthYear: string;
    amount: number;
    remarks: string;
    date: string;
  } | null>(null);

  const [editingFood, setEditingFood] = useState<CanteenFoodBill | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'advance' | 'food';
    id: string; // employeeId for advance, billId for food
    monthYear: string;
  } | null>(null);

  // Ascending-ordered employees list (by numerical employee code)
  const sortedEmployees = useMemo(() => {
    return [...employees]
      .filter(emp => emp.id && !emp.id.toUpperCase().startsWith('EMP_TEMP_') && emp.name)
      .sort((a, b) => {
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);
        if (isNaN(idA) && isNaN(idB)) return a.id.localeCompare(b.id);
        if (isNaN(idA)) return 1;
        if (isNaN(idB)) return -1;
        return idA - idB;
      });
  }, [employees]);

  // Synchronize state when page-level ledger dropdowns change
  React.useEffect(() => {
    setSelectedMonth(ledgerMonth - 1);
    setSelectedFoodMonth(ledgerMonth - 1);
    setSelectedYear(ledgerYear);
    setSelectedFoodYear(ledgerYear);
  }, [ledgerMonth, ledgerYear]);

  // Month names
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper to parse dates like "15 May 2026"
  const parseDateString = (dateStr?: string) => {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(' ');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const mIdx = months.indexOf(parts[1]);
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && mIdx !== -1 && !isNaN(y)) {
        return { d, mIdx, y };
      }
    }
    return null;
  };

  // Number of days helper
  const getDaysInMonth = (year: number, monthIdx: number) => {
    return new Date(year, monthIdx + 1, 0).getDate();
  };

  const daysInMonthAdvance = getDaysInMonth(selectedYear, selectedMonth);
  const daysInMonthFood = getDaysInMonth(selectedFoodYear, selectedFoodMonth);

  // Current year month string representation for ledger mapping (e.g. "2026-05")
  const formYearMonthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const foodFormYearMonthStr = `${selectedFoodYear}-${String(selectedFoodMonth + 1).padStart(2, '0')}`;

  // Ensure selected day is valid when month/year changes
  React.useEffect(() => {
    if (selectedDay > daysInMonthAdvance) {
      setSelectedDay(daysInMonthAdvance);
    }
  }, [selectedMonth, selectedYear, daysInMonthAdvance, selectedDay]);

  React.useEffect(() => {
    if (selectedFoodDay > daysInMonthFood) {
      setSelectedFoodDay(daysInMonthFood);
    }
  }, [selectedFoodMonth, selectedFoodYear, daysInMonthFood, selectedFoodDay]);

  React.useEffect(() => {
    const q = query(
      collection(db, 'canteenFoodBills'),
      where('monthYear', '==', foodFormYearMonthStr)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const billsList: CanteenFoodBill[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        billsList.push({
          id: doc.id,
          challanNo: data.challanNo || '',
          issuedBy: data.issuedBy || '',
          mealType: data.mealType || 'Lunch',
          noOfMeals: data.noOfMeals || 0,
          amount: data.amount || 0,
          date: data.date || '',
          monthYear: data.monthYear || '',
          remarks: data.remarks || '',
        });
      });
      setCanteenFoodBills(billsList);
    }, (error) => {
      console.error("Error subscribing to canteen food bills: ", error);
    });
    return () => unsubscribe();
  }, [foodFormYearMonthStr]);

  // Form handle submit for Advance Paid
  const handleAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized administrators can record advance payments.');
      return;
    }

    if (!selectedEmpId) {
      triggerAlert('warn', 'Please select a registered employee.');
      return;
    }

    const amountNum = parseFloat(advanceAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      triggerAlert('warn', 'Please enter a valid advance payment amount greater than ₹0.');
      return;
    }

    const selectedEmp = employees.find(emp => emp.id === selectedEmpId);
    if (!selectedEmp) {
      triggerAlert('warn', 'Employee not found in active database.');
      return;
    }

    setIsSubmittingAdvance(true);
    try {
      // Clean up previous month-year override if it shifted or employee shifted during Editing
      if (editingAdvance) {
        const oldEmpId = editingAdvance.employeeId;
        const oldMonthYearStr = editingAdvance.monthYear;
        const isDifferent = oldEmpId !== selectedEmpId || oldMonthYearStr !== formYearMonthStr;

        if (isDifferent) {
          const oldRef = doc(db, 'employees', oldEmpId, 'monthlyPayroll', oldMonthYearStr);
          await setDoc(oldRef, {
            advancePayment: 0,
            advanceRemarks: '',
            advanceDate: ''
          }, { merge: true });

          if (setAllMonthlyOverrides) {
            setAllMonthlyOverrides((prev: any) => {
              const emp = prev[oldEmpId] || {};
              const updatedMonth = { ...emp[oldMonthYearStr] };
              delete updatedMonth.advancePayment;
              delete updatedMonth.advanceRemarks;
              delete updatedMonth.advanceDate;
              return {
                ...prev,
                [oldEmpId]: {
                  ...emp,
                  [oldMonthYearStr]: updatedMonth
                }
              };
            });
          }
        }
      }

      // Save advance payment value under the selected employee's monthly payroll override
      const overrideRef = doc(db, 'employees', selectedEmpId, 'monthlyPayroll', formYearMonthStr);
      const advanceDateStr = `${selectedDay} ${months[selectedMonth]} ${selectedYear}`;
      await setDoc(overrideRef, { 
        advancePayment: amountNum,
        advanceRemarks: remarks.trim(),
        advanceDate: advanceDateStr
      }, { merge: true });

      if (setAllMonthlyOverrides) {
        setAllMonthlyOverrides((prev: any) => {
          const emp = prev[selectedEmpId] || {};
          return {
            ...prev,
            [selectedEmpId]: {
              ...emp,
              [formYearMonthStr]: {
                ...emp[formYearMonthStr],
                advancePayment: amountNum,
                advanceRemarks: remarks.trim(),
                advanceDate: advanceDateStr
              }
            }
          };
        });
      }

      triggerAlert('success', editingAdvance 
        ? `Successfully updated Advance Payment of ₹${amountNum.toLocaleString('en-IN')} for ${selectedEmp.name} (${selectedEmp.id}).`
        : `Successfully registered Advance Payment of ₹${amountNum.toLocaleString('en-IN')} for ${selectedEmp.name} (${selectedEmp.id}) on ${selectedDay} ${months[selectedMonth]} ${selectedYear}.`
      );
      setAdvanceAmount('');
      setRemarks('');
      setAdvanceSearch('');
      setSelectedEmpId('');
      setEditingAdvance(null);
    } catch (err: any) {
      console.error('Error saving advance payment', err);
      triggerAlert('warn', 'Failed to save advance payment in Cloud Database. Check system permissions.');
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  // Form handle submit for Food Bill
  const handleFoodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized administrators can record food bills.');
      return;
    }

    if (!challanNo.trim()) {
      triggerAlert('warn', 'Please enter a valid Challan Number.');
      return;
    }

    if (!challanIssuedBy.trim()) {
      triggerAlert('warn', 'Please specify who issued the Challan.');
      return;
    }

    const mealsNum = parseInt(noOfMeals, 10);
    if (isNaN(mealsNum) || mealsNum <= 0) {
      triggerAlert('warn', 'Please enter a valid number of meals greater than 0.');
      return;
    }

    const calculatedAmount = mealsNum * 55;
    setIsSubmittingFood(true);

    try {
      const foodDateStr = `${selectedFoodDay} ${months[selectedFoodMonth]} ${selectedFoodYear}`;
      const docId = editingFood ? editingFood.id : doc(collection(db, 'canteenFoodBills')).id;

      await setDoc(doc(db, 'canteenFoodBills', docId), {
        id: docId,
        challanNo: challanNo.trim(),
        issuedBy: challanIssuedBy.trim(),
        mealType,
        noOfMeals: mealsNum,
        amount: calculatedAmount,
        date: foodDateStr,
        monthYear: foodFormYearMonthStr,
        remarks: foodRemarks.trim()
      });

      triggerAlert('success', editingFood
        ? `Successfully updated Canteen Food Bill (Challan No: ${challanNo.trim()}).`
        : `Successfully registered Canteen Food Bill (Challan No: ${challanNo.trim()}, meals: ${mealsNum}) for ₹${calculatedAmount.toLocaleString('en-IN')}.`
      );

      // Reset form fields
      setChallanNo('');
      setChallanIssuedBy('');
      setMealType('Lunch');
      setNoOfMeals('');
      setFoodRemarks('');
      setEditingFood(null);
    } catch (err: any) {
      console.error('Error saving food bill', err);
      triggerAlert('warn', 'Failed to save food bill in Cloud Database. Check system permissions.');
    } finally {
      setIsSubmittingFood(false);
    }
  };

  const handleDeleteAdvance = async (empId: string, mYearStr: string) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized administrators can delete transactions.');
      return;
    }
    try {
      const overrideRef = doc(db, 'employees', empId, 'monthlyPayroll', mYearStr);
      await setDoc(overrideRef, {
        advancePayment: 0,
        advanceRemarks: '',
        advanceDate: ''
      }, { merge: true });

      if (setAllMonthlyOverrides) {
        setAllMonthlyOverrides((prev: any) => {
          const emp = prev[empId] || {};
          const updatedMonth = { ...emp[mYearStr] };
          delete updatedMonth.advancePayment;
          delete updatedMonth.advanceRemarks;
          delete updatedMonth.advanceDate;
          return {
            ...prev,
            [empId]: {
              ...emp,
              [mYearStr]: updatedMonth
            }
          };
        });
      }
      triggerAlert('success', 'Successfully deleted the advance payment record.');
    } catch (err) {
      console.error('Error deleting advance', err);
      triggerAlert('warn', 'Failed to delete record. Please check system permissions.');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleDeleteFood = async (billId: string) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized administrators can delete transactions.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'canteenFoodBills', billId));
      triggerAlert('success', 'Successfully deleted the canteen food bill record.');
    } catch (err) {
      console.error('Error deleting food bill', err);
      triggerAlert('warn', 'Failed to delete record. Please check system permissions.');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // List of disbursals in the matching selected month-year for advances
  const recordedDisbursals = useMemo(() => {
    const list: { employeeId: string; name: string; amount: number; monthYear: string; remarks?: string; date?: string }[] = [];
    employees.forEach(emp => {
      // Filter out blanks
      if (!emp.id || emp.id.toUpperCase().startsWith('EMP_TEMP_')) return;
      
      const override = allMonthlyOverrides[emp.id]?.[formYearMonthStr];
      if (override && override.advancePayment !== undefined && override.advancePayment > 0) {
        list.push({
          employeeId: emp.id,
          name: emp.name || `Employee ${emp.id}`,
          amount: override.advancePayment,
          monthYear: formYearMonthStr,
          remarks: override.advanceRemarks || '',
          date: override.advanceDate || `${months[selectedMonth]} ${selectedYear}`
        });
      }
    });
    return list;
  }, [employees, allMonthlyOverrides, formYearMonthStr, selectedMonth, selectedYear]);

  // Sort recorded advances by Emp ID or Record Date
  const sortedRecordedDisbursals = useMemo(() => {
    const list = [...recordedDisbursals];
    if (!sortField) return list;

    const getTimestamp = (dateStr?: string) => {
      if (!dateStr) return 0;
      const parsed = parseDateString(dateStr);
      if (parsed) {
        return new Date(parsed.y, parsed.mIdx, parsed.d).getTime();
      }
      const t = Date.parse(dateStr);
      return isNaN(t) ? 0 : t;
    };

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = getTimestamp(a.date) - getTimestamp(b.date);
      } else if (sortField === 'employeeId') {
        comparison = a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [recordedDisbursals, sortField, sortDirection]);

  // Sort and list food bills derived from state
  const recordedFoodBills = useMemo(() => {
    const list = [...canteenFoodBills];
    const getTimestamp = (dateStr?: string) => {
      if (!dateStr) return 0;
      const parsed = parseDateString(dateStr);
      if (parsed) {
        return new Date(parsed.y, parsed.mIdx, parsed.d).getTime();
      }
      const t = Date.parse(dateStr);
      return isNaN(t) ? 0 : t;
    };

    return list.sort((a, b) => {
      const comp = getTimestamp(a.date) - getTimestamp(b.date);
      return foodSortDirection === 'asc' ? comp : -comp;
    });
  }, [canteenFoodBills, foodSortDirection]);

  // Format currency
  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="advances-food-bill-panel">
      
      {/* 🧭 Top Summary Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Wallet className="text-emerald-500" size={24} />
            Advances & Food Bill Tracker
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Track, disburse, and manage employee advances and canteen charges
          </p>
        </div>
        <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl px-3.5 py-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-550 shadow-xs">
          <Landmark size={15} className="text-emerald-500 animate-pulse shrink-0" />
          <span className="shrink-0 font-bold uppercase tracking-wider text-[10px] text-slate-400">Select Month-Year:</span>
          <select
            value={selectedMonth}
            onChange={(e) => {
              const val = Number(e.target.value);
              setSelectedMonth(val);
              setSelectedFoodMonth(val);
              if (setLedgerMonth) {
                setLedgerMonth(val + 1);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl py-1 px-2 text-xs font-black text-slate-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
          >
            {months.map((m, idx) => (
              <option key={idx} value={idx}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => {
              const val = Number(e.target.value);
              setSelectedYear(val);
              setSelectedFoodYear(val);
              if (setLedgerYear) {
                setLedgerYear(val);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl py-1 px-2 text-xs font-black text-slate-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Advances and Food Bills side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* ==================== COLUMN 1: SALARY ADVANCES ==================== */}
        <div className="space-y-6">
          
          {/* Form Card */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${editingAdvance ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {editingAdvance ? <Edit size={16} /> : <Plus size={16} />}
              </div>
              <div>
                {editingAdvance ? (
                  <div>
                    <h3 className="text-sm font-black uppercase text-amber-600 tracking-wider flex items-center gap-1">Editing Salary Advance</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Updating {editingAdvance.employeeId}'s logged record</p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Salary Advance Disbursal</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Insert advances into active payroll ledger</p>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleAdvanceSubmit} className="space-y-4">
              {/* Employee selection with ascending autocomplete search */}
              <div className="space-y-2.5 relative">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Select Employee Roster
                  </label>
                  <span className="text-[9.5px] bg-[#e6fcf5] text-[#0c8569] px-2 py-0.5 rounded-full font-black uppercase tracking-wider scale-90">Code Ascending</span>
                </div>
                
                {/* 🔍 Autocomplete Interactive Search Input */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400 pointer-events-none">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search employee by name or code..."
                      value={advanceSearch}
                      onChange={(e) => {
                        setAdvanceSearch(e.target.value);
                        setShowAdvanceSug(true);
                      }}
                      onFocus={() => setShowAdvanceSug(true)}
                      onBlur={() => setTimeout(() => setShowAdvanceSug(false), 250)}
                      disabled={!!editingAdvance}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-9 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-70"
                    />
                    {advanceSearch && !editingAdvance && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdvanceSearch('');
                          setSelectedEmpId('');
                        }}
                        className="absolute right-3 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer p-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Suggestions Popover Selection */}
                  {showAdvanceSug && !editingAdvance && (
                    <div className="absolute z-30 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                      {sortedEmployees
                        .filter(emp => {
                          const queryStr = advanceSearch.toLowerCase().trim();
                          if (!queryStr) return true;
                          return (emp.name || '').toLowerCase().includes(queryStr) || (emp.id || '').toLowerCase().includes(queryStr);
                        })
                        .map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onMouseDown={() => {
                              setSelectedEmpId(emp.id);
                              setAdvanceSearch(`${emp.name} (${emp.id})`);
                              setShowAdvanceSug(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-bold flex justify-between items-center transition-colors cursor-pointer hover:bg-slate-50 ${
                              selectedEmpId === emp.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-705'
                            }`}
                          >
                            <span>{emp.name}</span>
                            <span className="font-mono bg-slate-100 text-slate-500 text-[10px] px-2.5 py-0.5 rounded-md font-bold">Code {emp.id}</span>
                          </button>
                        ))}
                      {sortedEmployees.filter(emp => {
                        const queryStr = advanceSearch.toLowerCase().trim();
                        if (!queryStr) return true;
                        return (emp.name || '').toLowerCase().includes(queryStr) || (emp.id || '').toLowerCase().includes(queryStr);
                      }).length === 0 && (
                        <div className="p-3 text-xs text-slate-450 text-center font-bold">No employees found matching "{advanceSearch}"</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Standard Select Dropdown choice as fall-back option */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Or dropdown:</span>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedEmpId(val);
                      if (val) {
                        const matchedEmp = sortedEmployees.find(x => x.id === val);
                        if (matchedEmp) {
                          setAdvanceSearch(`${matchedEmp.name} (${matchedEmp.id})`);
                        }
                      } else {
                        setAdvanceSearch('');
                      }
                    }}
                    disabled={!!editingAdvance}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-bold text-slate-700 cursor-pointer focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-75"
                  >
                    <option value="">-- Choose Staff Profile (Sorted) --</option>
                    {sortedEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        Code {emp.id} - {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advance amount paid input */}
              <div>
                <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  Advance Amount (₹ INR)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-4 text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Day / Month / Year Dropdowns */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Day</label>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                  >
                    {Array.from({ length: daysInMonthAdvance }, (_, idx) => idx + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-1 text-[11px] font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>{m.slice(0, 3)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-1 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Remarks input box */}
              <div>
                <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  Remarks (Optional)
                </label>
                <textarea
                  placeholder="e.g. Health assistance, salary advance request, festival assistance"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              <div className="flex gap-2.5">
                {editingAdvance && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAdvance(null);
                      setAdvanceAmount('');
                      setRemarks('');
                      setAdvanceSearch('');
                      setSelectedEmpId('');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmittingAdvance}
                  className={`py-3 px-4.5 rounded-xl capitalize font-black text-xs tracking-wider uppercase text-white shadow-md transition-all cursor-pointer ${
                    editingAdvance ? 'flex-[2]' : 'w-full'
                  } ${
                    isSubmittingAdvance
                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                      : editingAdvance
                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
                        : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/10'
                  }`}
                >
                  {isSubmittingAdvance ? (editingAdvance ? 'Updating...' : 'Recording...') : (editingAdvance ? 'Save Changes' : 'Record Advance Paid')}
                </button>
              </div>
            </form>
          </div>

          {/* Advances Ledger List */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm flex flex-col min-h-[220px]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <History className="text-slate-550" size={17} />
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  Recorded Advances for {months[selectedMonth]} {selectedYear}
                </h4>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase font-mono bg-slate-100 px-2.5 py-0.5 rounded-lg">
                {recordedDisbursals.length} logged
              </span>
            </div>

            {recordedDisbursals.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-10 text-slate-400">
                <Coins size={36} className="text-slate-200 stroke-1 mb-2 animate-bounce" />
                <p className="text-xs font-bold uppercase">No Advances Disbursed</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase leading-snug">Submit the Left form to add a payroll entry for this month-year</p>
              </div>
            ) : (
              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-left border-collapse select-text">
                  <thead>
                     <tr className="border-b border-slate-150 text-[9px] font-black tracking-wider text-slate-400 uppercase select-none">
                      <th 
                        className="py-2 pr-2 cursor-pointer hover:text-slate-700 transition-colors"
                        onClick={() => {
                          if (sortField === 'employeeId') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('employeeId');
                            setSortDirection('asc');
                          }
                        }}
                        title="Sort by Emp ID"
                      >
                        <span className="inline-flex items-center gap-1">
                          Emp ID
                          {sortField === 'employeeId' ? (
                            sortDirection === 'asc' ? <ArrowUp size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-emerald-500" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-300" />
                          )}
                        </span>
                      </th>
                      <th className="py-2 pr-2">Employee Name</th>
                      <th 
                        className="py-2 pr-1 cursor-pointer hover:text-slate-700 transition-colors"
                        onClick={() => {
                          if (sortField === 'date') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('date');
                            setSortDirection('asc');
                          }
                        }}
                        title="Sort by Record Date"
                      >
                        <span className="inline-flex items-center gap-1">
                          Record Date
                          {sortField === 'date' ? (
                            sortDirection === 'asc' ? <ArrowUp size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-emerald-500" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-300" />
                          )}
                        </span>
                      </th>
                      <th className="py-2 pr-1">Remarks</th>
                      <th className="py-2 text-right">Advance Amount</th>
                      <th className="py-2 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {sortedRecordedDisbursals.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 font-mono font-black text-slate-600">{r.employeeId}</td>
                        <td className="py-2.5 font-extrabold text-slate-800">{r.name}</td>
                        <td className="py-2.5 font-mono font-bold text-slate-500 whitespace-nowrap uppercase text-[9.5px]">{r.date || '-'}</td>
                        <td className="py-2.5 text-slate-500 italic font-medium uppercase text-[10px] whitespace-normal break-words max-w-[120px]" title={r.remarks || '-'}>
                          {r.remarks || '-'}
                        </td>
                        <td className="py-2.5 text-right font-mono font-black text-emerald-600">
                          {formatINR(r.amount)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap pr-1.5">
                          {deleteConfirm?.type === 'advance' && deleteConfirm?.employeeId === r.employeeId && deleteConfirm?.monthYear === r.monthYear ? (
                            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[10px]">
                              <span className="text-rose-700 font-extrabold uppercase text-[9px]">Delete?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteAdvance(r.employeeId, r.monthYear)}
                                className="text-emerald-700 hover:text-emerald-900 font-black p-0.5"
                                title="Yes, delete"
                              >
                                <Check size={14} className="stroke-[3]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="text-rose-700 hover:text-rose-900 font-black p-0.5"
                                title="No, cancel"
                              >
                                <X size={14} className="stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAdvance({
                                    employeeId: r.employeeId,
                                    monthYear: r.monthYear,
                                    amount: r.amount,
                                    remarks: r.remarks || '',
                                    date: r.date || ''
                                  });
                                  setSelectedEmpId(r.employeeId);
                                  setAdvanceSearch(`${r.name} (${r.employeeId})`);
                                  setAdvanceAmount(String(r.amount));
                                  setRemarks(r.remarks || '');
                                  
                                  const parsed = parseDateString(r.date);
                                  if (parsed) {
                                    setSelectedDay(parsed.d);
                                    setSelectedMonth(parsed.mIdx);
                                    setSelectedYear(parsed.y);
                                  } else {
                                    // Fallback to monthYear parameters parsed
                                    const parts = r.monthYear.split('-');
                                    if (parts.length === 2) {
                                      setSelectedMonth(parseInt(parts[1], 10) - 1);
                                      setSelectedYear(parseInt(parts[0], 10));
                                    }
                                  }
                                  
                                  triggerAlert('info', `Loaded advance record for ${r.name} into form. Modify and click Save Changes.`);
                                }}
                                disabled={viewOnly}
                                className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                                title="Edit record"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm({ type: 'advance', employeeId: r.employeeId, monthYear: r.monthYear })}
                                disabled={viewOnly}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                                title="Delete record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ==================== COLUMN 2: FOOD BILL CHARGES ==================== */}
        <div className="space-y-6">
          
          {/* Form Card */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${editingFood ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
                {editingFood ? <Edit size={16} /> : <Coffee size={16} />}
              </div>
              <div>
                {editingFood ? (
                  <div>
                    <h3 className="text-sm font-black uppercase text-amber-600 tracking-wider flex items-center gap-1">Editing Food Bill</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Updating {editingFood.employeeId}'s logged record</p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Canteen Food Bill</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Charge meals directly into active payroll ledger</p>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleFoodSubmit} className="space-y-4">
              {/* Challan Number Input */}
              <div>
                <label className="block mb-1.5 text-[11.5px] font-black uppercase text-slate-400 tracking-wider">
                  Challan No
                </label>
                <input
                  type="text"
                  placeholder="e.g. CH-2591"
                  required
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Challan Issued By Input */}
              <div>
                <label className="block mb-1.5 text-[11.5px] font-black uppercase text-slate-400 tracking-wider">
                  Challan Issued By
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hardyal Singh"
                  required
                  value={challanIssuedBy}
                  onChange={(e) => setChallanIssuedBy(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Meal Type & No of meals */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Meal Type
                  </label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as 'Lunch' | 'Dinner')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-705 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-orange-500 cursor-pointer"
                  >
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    No. of Meals
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 20"
                    required
                    value={noOfMeals}
                    onChange={(e) => setNoOfMeals(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Live Calculator display */}
              <div className="bg-orange-50/55 border border-orange-100 rounded-2xl p-3.5 flex justify-between items-center">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-0.5">Auto Calculated Cost</span>
                  <span className="text-xs font-mono text-slate-500 font-extrabold tracking-tight">
                    {Number(noOfMeals) || 0} meals × ₹55
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-bold uppercase text-[9px] tracking-wider mb-0.5">Amount Due</span>
                  <span className="text-md font-mono font-black text-orange-600">
                    {formatINR((Number(noOfMeals) || 0) * 55)}
                  </span>
                </div>
              </div>

              {/* Day / Month / Year Dropdowns */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Day</label>
                  <select
                    value={selectedFoodDay}
                    onChange={(e) => setSelectedFoodDay(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-705 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    {Array.from({ length: daysInMonthFood }, (_, idx) => idx + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month</label>
                  <select
                    value={selectedFoodMonth}
                    onChange={(e) => setSelectedFoodMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl py-2 px-3 text-xs font-bold text-slate-705 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>{m.slice(0, 3)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year</label>
                  <select
                    value={selectedFoodYear}
                    onChange={(e) => setSelectedFoodYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-750 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Food Remarks input box */}
              <div>
                <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  Remarks / Canteen Notes (Optional)
                </label>
                <textarea
                  placeholder="e.g. Lunch/Dinner mess charges, monthly coupons"
                  value={foodRemarks}
                  onChange={(e) => setFoodRemarks(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-none font-sans"
                />
              </div>

              <div className="flex gap-2.5">
                {editingFood && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFood(null);
                      setChallanNo('');
                      setChallanIssuedBy('');
                      setMealType('Lunch');
                      setNoOfMeals('');
                      setFoodRemarks('');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmittingFood}
                  className={`py-3 px-4.5 rounded-xl capitalize font-black text-xs tracking-wider uppercase text-white shadow-md transition-all cursor-pointer ${
                    editingFood ? 'flex-[2]' : 'w-full'
                  } ${
                    isSubmittingFood
                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                      : editingFood
                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
                        : 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/10'
                  }`}
                >
                  {isSubmittingFood ? (editingFood ? 'Updating...' : 'Saving...') : (editingFood ? 'Save Changes' : 'Log Food Challan')}
                </button>
              </div>
            </form>
          </div>
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm flex flex-col min-h-[220px]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="text-slate-550" size={17} />
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  Logged Food Challan Register for {months[selectedFoodMonth]} {selectedFoodYear}
                </h4>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase font-mono bg-slate-100 px-2.5 py-0.5 rounded-lg">
                {recordedFoodBills.length} logged
              </span>
            </div>

            {recordedFoodBills.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-10 text-slate-400">
                <Utensils size={36} className="text-slate-200 stroke-1 mb-2 animate-bounce" />
                <p className="text-xs font-bold uppercase">No Canteen Challans Logged</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase leading-snug">Submit the Left form to log canteen challans on this month-year</p>
              </div>
            ) : (
              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-left border-collapse select-text">
                  <thead>
                    <tr className="border-b border-slate-150 text-[9px] font-black tracking-wider text-slate-400 uppercase select-none">
                      <th className="py-2 pr-2">Challan No</th>
                      <th className="py-2 pr-2">Issued By</th>
                      <th className="py-2 pr-2">Meal Type</th>
                      <th className="py-2 pr-2">Meals Count</th>
                      <th 
                        className="py-2 pr-1 cursor-pointer hover:text-slate-700 transition-colors"
                        onClick={() => {
                          setFoodSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        }}
                        title="Sort by Record Date"
                      >
                        <span className="inline-flex items-center gap-1">
                          Record Date
                          {foodSortDirection === 'asc' ? (
                            <ArrowUp size={11} className="text-emerald-500" />
                          ) : (
                            <ArrowDown size={11} className="text-emerald-500" />
                          )}
                        </span>
                      </th>
                      <th className="py-2 text-right">Amount (₹)</th>
                      <th className="py-2 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-750">
                    {recordedFoodBills.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 font-mono font-black text-rose-600 font-bold">{r.challanNo}</td>
                        <td className="py-2.5 font-extrabold text-slate-800">{r.issuedBy}</td>
                        <td className="py-2.5">
                          <span className={`px-2.5 py-0.5 text-[9px] font-black rounded-lg uppercase tracking-wider ${
                            r.mealType === 'Lunch' 
                              ? 'bg-amber-100 text-amber-850'
                              : 'bg-indigo-100 text-indigo-850'
                          }`}>
                            {r.mealType}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-650 font-bold">{r.noOfMeals}</td>
                        <td className="py-2.5 font-mono font-bold text-slate-550 whitespace-nowrap uppercase text-[9.5px]">{r.date || '-'}</td>
                        <td className="py-2.5 text-right font-mono font-black text-orange-600">
                          {formatINR(r.amount)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap pr-1.5">
                          {deleteConfirm?.type === 'food' && deleteConfirm?.id === r.id && deleteConfirm?.monthYear === r.monthYear ? (
                            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[10px]">
                              <span className="text-rose-700 font-extrabold uppercase text-[9px]">Delete?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteFood(r.id)}
                                className="text-emerald-700 hover:text-emerald-900 font-black p-0.5"
                                title="Yes, delete"
                              >
                                <Check size={14} className="stroke-[3]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="text-rose-700 hover:text-rose-900 font-black p-0.5"
                                title="No, cancel"
                              >
                                <X size={14} className="stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFood(r);
                                  setChallanNo(r.challanNo);
                                  setChallanIssuedBy(r.issuedBy);
                                  setMealType(r.mealType);
                                  setNoOfMeals(String(r.noOfMeals));
                                  setFoodRemarks(r.remarks || '');
                                  
                                  const parsed = parseDateString(r.date);
                                  if (parsed) {
                                    setSelectedFoodDay(parsed.d);
                                    setSelectedFoodMonth(parsed.mIdx);
                                    setSelectedFoodYear(parsed.y);
                                  } else {
                                    const parts = r.monthYear.split('-');
                                    if (parts.length === 2) {
                                      setSelectedFoodMonth(parseInt(parts[1], 10) - 1);
                                      setSelectedFoodYear(parseInt(parts[0], 10));
                                    }
                                  }
                                  
                                  triggerAlert('info', `Loaded Canteen Challan (No: ${r.challanNo}) into form. Modify and click Save Changes.`);
                                }}
                                disabled={viewOnly}
                                className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-55 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                                title="Edit record"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm({ type: 'food', id: r.id, monthYear: r.monthYear })}
                                disabled={viewOnly}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                                title="Delete record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
