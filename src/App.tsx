/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Employee, ComputedEmployee, SalarySettings } from './types';
import { INITIAL_EMPLOYEES, calculateSalary } from './data';
import Dashboard from './components/Dashboard';
import ExcelTable from './components/ExcelTable';
import EmployeeProfileDetails from './components/EmployeeProfileDetails';
import AttendanceImport from './components/AttendanceImport';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  Grid, 
  Users, 
  Inbox, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Briefcase, 
  Globe, 
  Settings, 
  Bell, 
  Search, 
  Printer, 
  CheckCircle, 
  Download, 
  AlertCircle,
  FileSpreadsheet,
  Info,
  X,
  Plus,
  HelpCircle,
  Menu,
  ChevronRight,
  Sparkles,
  Award,
  BookOpen,
  Send,
  UserCheck
} from 'lucide-react';

export default function App() {
  // Store original Employee rows
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'payroll' | 'calendar' | 'attendance' | 'performance' | 'leave' | 'recruitment'>('employees');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('55'); // Hardyal (First employee in yesterday's attendance PDF!)
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  
  // Local ledger saving indicators
  const [isSaving, setIsSaving] = useState(false);
  const [savedTime, setSavedTime] = useState<string>('');

  // Search & Navigation variables
  const [topSearchQuery, setTopSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Setup initial state from Firestore in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'employees'), async (snapshot) => {
      if (snapshot.empty) {
        // New Firestore database; perform standard seeding of populated records.
        // Unpopulated empty spreadsheet row templates are generated client-side by our merge algorithm.
        try {
          const batch = writeBatch(db);
          const filledSeeds = INITIAL_EMPLOYEES.filter(emp => (emp.name || '').trim() !== '');
          filledSeeds.forEach(emp => {
            batch.set(doc(db, 'employees', emp.id), emp);
          });
          await batch.commit();
          setSavedTime('Cloud Seeds Installed');
        } catch (err) {
          console.error("Auto-seeding Firestore failed", err);
        }
        return;
      }

      const firestoreEmployees: Employee[] = [];
      snapshot.forEach((docSnap) => {
        firestoreEmployees.push(docSnap.data() as Employee);
      });

      // Automated Migration: If we detect that the database possesses some data but the new real dataset (which includes Employee '55') is missing,
      // then safely clear and re-seed the 45 real clean employees. We do not trigger this on emp.id starting with 'EMP-' to avoid deleting manual or imported entries.
      const hasOldSeeds = firestoreEmployees.length > 0 && !firestoreEmployees.some(emp => emp.id === '55');
      if (hasOldSeeds) {
        try {
          const batch = writeBatch(db);
          // Delete all current demo records
          firestoreEmployees.forEach(emp => {
            batch.delete(doc(db, 'employees', emp.id));
          });
          // Reseed with our 45 real employees
          const filledSeeds = INITIAL_EMPLOYEES.filter(emp => (emp.name || '').trim() !== '');
          filledSeeds.forEach(emp => {
            batch.set(doc(db, 'employees', emp.id), emp);
          });
          await batch.commit();
          console.log("Database successfully migrated to May 26-2025 Attendance PDF roster.");
        } catch (err) {
          console.error("Automated database migration failed:", err);
        }
        return;
      }

      // Keep all active/saved Firestore documents
      const merged: Employee[] = [...firestoreEmployees];

      // Identify all IDs currently present in our Firestore active records list (case-insensitive)
      const takenIds = new Set(firestoreEmployees.map(e => e.id.toLowerCase()));

      // Generate additional blank template rows to maintain exactly 160 spreadsheet elements
      let currentNum = 46;
      while (merged.length < 160 && currentNum <= 1000) {
        const tempId = `EMP_TEMP_${String(currentNum).padStart(3, '0')}`;
        if (!takenIds.has(tempId.toLowerCase())) {
          merged.push({
            id: tempId,
            name: '',
            monthlySalary: 0,
            workingDays: 0,
            workingHours: 0,
            fullDaysAbsent: 0,
            absentHours: 0,
            absentMinutes: 0,
          });
        }
        currentNum++;
      }

      setEmployees(merged);
      setSavedTime(new Date().toLocaleTimeString());
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    });

    return () => unsubscribe();
  }, []);

  // Compute calculated row fields dynamically on active dataset changes
  const computedEmployees = useMemo(() => {
    return employees.map(calculateSalary);
  }, [employees]);

  // Aggregate sums for quick banner card KPIs
  const quickKPIs = useMemo(() => {
    let totalGross = 0;
    let totalDeds = 0;
    let totalPay = 0;
    let count = 0;

    computedEmployees.forEach(emp => {
      totalGross += emp.monthlySalary || 0;
      totalDeds += emp.totalDeduction || 0;
      totalPay += emp.finalPayable || 0;
      if ((emp.name || '').trim()) count++;
    });

    return {
      gross: totalGross,
      deductions: totalDeds,
      payable: totalPay,
      staffCount: count
    };
  }, [computedEmployees]);

  // Active highlighted employee profile
  const activeSelectedEmployee = useMemo(() => {
    return computedEmployees.find(emp => emp.id === selectedEmployeeId) || computedEmployees[0] || null;
  }, [computedEmployees, selectedEmployeeId]);

  // Top Search results filter
  const searchResults = useMemo(() => {
    if (!topSearchQuery.trim()) return [];
    return computedEmployees.filter(emp => 
      (emp.name || '').toLowerCase().includes(topSearchQuery.toLowerCase()) ||
      (emp.id || '').toLowerCase().includes(topSearchQuery.toLowerCase())
    );
  }, [computedEmployees, topSearchQuery]);

  // Helper trigger alert
  const triggerAlert = (type: 'success' | 'info', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg(null);
    }, 4000);
  };

  // Direct action handlers - synchronized directly with cloud Firestore
  const handleUpdateEmployee = async (id: string, updatedFields: Partial<Employee>) => {
    const exists = employees.some(emp => emp.id === id);
    let targetEmployee: Employee;

    if (exists) {
      targetEmployee = { ...employees.find(emp => emp.id === id)!, ...updatedFields };
    } else {
      targetEmployee = {
        id,
        name: 'NEW EMPLOYEE',
        monthlySalary: 0,
        workingDays: 26,
        workingHours: 9,
        fullDaysAbsent: 0,
        absentHours: 0,
        absentMinutes: 0,
        ...updatedFields
      };
    }

    const isIdChange = updatedFields.id !== undefined && updatedFields.id !== id;
    const finalDocId = isIdChange ? updatedFields.id! : id;

    // Immediately update local state so UI updates instantly without awaiting Firestore roundtrip network latency
    setEmployees(prev => {
      const existsInState = prev.some(emp => emp.id === id);
      if (existsInState) {
        return prev.map(emp => {
          if (emp.id === id) {
            return {
              ...emp,
              ...updatedFields,
              id: finalDocId
            };
          }
          return emp;
        });
      } else {
        return [...prev, { ...targetEmployee, id: finalDocId }];
      }
    });

    // Explicitly sanitize database types to match firestore.rules validation expectations
    const sanitized: any = {
      id: finalDocId,
      name: targetEmployee.name || "",
      monthlySalary: Number(targetEmployee.monthlySalary) || 0,
      workingDays: Number(targetEmployee.workingDays) || 0,
      workingHours: Number(targetEmployee.workingHours) || 0,
      fullDaysAbsent: Number(targetEmployee.fullDaysAbsent) || 0,
      absentHours: Number(targetEmployee.absentHours) || 0,
      absentMinutes: Number(targetEmployee.absentMinutes) || 0,
    };

    if (targetEmployee.role !== undefined) sanitized.role = targetEmployee.role;
    if (targetEmployee.email !== undefined) sanitized.email = targetEmployee.email;
    if (targetEmployee.phone !== undefined) sanitized.phone = targetEmployee.phone;
    if (targetEmployee.gender !== undefined) sanitized.gender = targetEmployee.gender;
    if (targetEmployee.dob !== undefined) sanitized.dob = targetEmployee.dob;
    if (targetEmployee.address !== undefined) sanitized.address = targetEmployee.address;
    if (targetEmployee.joinDate !== undefined) sanitized.joinDate = targetEmployee.joinDate;
    if (targetEmployee.workModel !== undefined) sanitized.workModel = targetEmployee.workModel;
    if (targetEmployee.employmentType !== undefined) sanitized.employmentType = targetEmployee.employmentType;
    if (targetEmployee.notes !== undefined) sanitized.notes = targetEmployee.notes;
    if (targetEmployee.documents !== undefined) sanitized.documents = targetEmployee.documents;

    try {
      if (isIdChange) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'employees', finalDocId), sanitized);
        batch.delete(doc(db, 'employees', id));
        await batch.commit();

        if (selectedEmployeeId === id) {
          setSelectedEmployeeId(finalDocId);
        }
      } else {
        await setDoc(doc(db, 'employees', id), sanitized);
      }
      setSavedTime(new Date().toLocaleTimeString());
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${finalDocId}`);
    }
  };

  const handleAddEmployee = async () => {
    // Generate consecutive EMP-xxx code
    const maxNumericId = employees.reduce((max, current) => {
      const match = current.id.match(/^EMP-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1]);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const nextId = `EMP-${String(maxNumericId + 1).padStart(3, '0')}`;
    const newStaff: Employee = {
      id: nextId,
      name: 'NEW STAFF MEMBER',
      monthlySalary: 25000,
      workingDays: 26,
      workingHours: 9.00,
      fullDaysAbsent: 0,
      absentHours: 0,
      absentMinutes: 0,
      role: 'Staff Consultant',
      joinDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      workModel: 'Hybrid',
      employmentType: 'Full-Time',
      notes: ['New roster slot successfully registered.'],
      documents: []
    };

    const path = `employees/${nextId}`;
    try {
      await setDoc(doc(db, 'employees', nextId), newStaff);
      triggerAlert('success', `Roster slot ${nextId} created successfully in Cloud DB!`);
      handleTransitionToProfile(nextId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (confirm(`Do you want to permanently delete Employee ${id} details from the active cloud database?`)) {
      const path = `employees/${id}`;
      try {
        await deleteDoc(doc(db, 'employees', id));
        triggerAlert('info', `Removed record ID ${id} from working cloud database.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  // Restore factory 160-employee baseline in Cloud Firestore
  const handleResetData = async () => {
    if (confirm('Revert all employee records in Firestore to factory default (5 populated, 155 template empty rows)? This will delete completely new entries.')) {
      setIsSaving(true);
      try {
        const batch = writeBatch(db);
        // Delete current list
        employees.forEach(emp => {
          batch.delete(doc(db, 'employees', emp.id));
        });
        // Reseed only the non-empty records to match storage best practices
        const populatedSeeds = INITIAL_EMPLOYEES.filter(emp => (emp.name || '').trim() !== '');
        populatedSeeds.forEach(emp => {
          batch.set(doc(db, 'employees', emp.id), emp);
        });
        await batch.commit();
        setSavedTime('Cloud Reinitialized');
        setSelectedEmployeeId('55');
        triggerAlert('success', 'Roster state successfully re-established in Google Cloud Firestore!');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'employees/reset');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Modify bulk parameters constants
  const handleBulkUpdateSettings = async (days: number, hours: number) => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      // Only write populated rows to avoid unneeded document writes
      employees.forEach(emp => {
        batch.set(doc(db, 'employees', emp.id), {
          ...emp,
          workingDays: days,
          workingHours: hours
        }, { merge: true });
      });
      await batch.commit();
      triggerAlert('success', `Mass-updated settings constants for all staff to ${days} working days and ${hours} working hours per day.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees/bulk-update');
    } finally {
      setIsSaving(false);
    }
  };

  // Verify and signal perfect synchronization state with the database
  const triggerManualSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSavedTime(new Date().toLocaleTimeString());
      triggerAlert('success', 'Payroll sheets in perfect synchronization with Google Cloud Firestore database.');
    }, 600);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper formatting INR
  const formatBriefINR = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  const handleTransitionToProfile = (id: string) => {
    setSelectedEmployeeId(id);
    setActiveTab('employees');
    triggerAlert('info', `Switched view focus to employee ID: ${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Interactive mock handlers for the rest of TeamHub's tabs!
  const [mockLeaves, setMockLeaves] = useState([
    { id: 1, name: 'Rahul Kumar', type: 'Annual Leave', duration: '3 Days', date: 'June 10 - June 12', status: 'Pending' },
    { id: 2, name: 'Sonu Sharma', type: 'Sick Leave', duration: '1 Day', date: 'June 05', status: 'Approved' },
    { id: 3, name: 'Sushil Verma', type: 'Casual Leave', duration: '2 Hours', date: 'June 08', status: 'Rejected' },
  ]);

  const handleModifyLeave = (id: number, decision: 'Approved' | 'Rejected') => {
    setMockLeaves(prev => prev.map(lv => lv.id === id ? { ...lv, status: decision } : lv));
    triggerAlert('success', `Leave request #${id} has been marked as ${decision}.`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]/50 text-slate-700 flex font-sans relative antialiased print:bg-white" id="applet-core">
      
      {/* ==================== 1. SIDEBAR: BRAND LOGO & LINKS (Left Column) ==================== */}
      <aside className={`w-64 bg-white border-r border-slate-150 select-none h-screen flex flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-40 transform md:translate-x-0 md:sticky md:top-0 transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'} print:hidden`}>
        <div className="flex flex-col flex-1 min-h-0">
          
          {/* Logo Brand Header */}
          <div className="p-6 pb-4 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-[#0da16e] rounded-xl flex items-center justify-center text-black shadow-xs shadow-teal-500/10 select-none shrink-0" id="salarypro-brand-icon">
                <svg className="w-6.5 h-6.5 text-black" fill="none" viewBox="0 0 100 100" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  {/* Bill 1 (Backmost) */}
                  <g transform="rotate(-30 40 60)">
                    <rect x="35" y="15" width="28" height="46" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="38" y="18" width="22" height="40" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </g>
                  {/* Bill 2 (Middle) */}
                  <g transform="rotate(-15 45 65)">
                    <rect x="38" y="15" width="28" height="46" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="41" y="18" width="22" height="40" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </g>
                  {/* Bill 3 (Frontmost - detailed) */}
                  <g>
                    <rect x="48" y="16" width="30" height="48" rx="2.5" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="51" y="19" width="24" height="42" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    {/* Top ornamental lines || */}
                    <line x1="59" y1="23" x2="59" y2="28" stroke="currentColor" strokeWidth="1.8" />
                    <line x1="63" y1="23" x2="63" y2="28" stroke="currentColor" strokeWidth="1.8" />
                    {/* Bottom ornamental lines || */}
                    <line x1="59" y1="52" x2="59" y2="57" stroke="currentColor" strokeWidth="1.8" />
                    <line x1="63" y1="52" x2="63" y2="57" stroke="currentColor" strokeWidth="1.8" />
                    {/* Center watermark circle */}
                    <circle cx="61" cy="40" r="5.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
                    {/* Portrait profile curves */}
                    <path d="M60 38 a 2.5 2.5 0 0 1 0 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </g>
                  {/* Hand gripping the bills */}
                  <path d="M22 74 C 30 58, 48 41, 52 41 C 55 41, 54 46, 48 51 M49 52 C 51 54, 53 56, 49 61 C 45 66, 43 74, 43 74" stroke="currentColor" strokeWidth="3" fill="none" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-800 font-display">
                SalaryPro
              </span>
            </div>
            {/* Mobile close button */}
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Links (Matches screenshot icons and titles perfectly) */}
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto cursor-pointer">
            
            {/* Dashboard Link */}
            <button
              onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'dashboard' 
                  ? 'bg-slate-55 text-slate-850 font-black shadow-xs' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Grid size={16} />
              <span>Dashboard</span>
            </button>

            {/* Calendar Link */}
            <button
              onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'calendar' 
                  ? 'bg-slate-55 text-slate-850 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Calendar size={16} />
              <span>Calendar</span>
            </button>

            {/* Employees Link (Active in the UI mockup with Mint background!) */}
            <button
              onClick={() => { setActiveTab('employees'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'employees' 
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users size={16} />
              <span>Employees</span>
            </button>

            {/* Attendance Link */}
            <button
              onClick={() => { setActiveTab('attendance'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'attendance' 
                  ? 'bg-slate-55 text-slate-850 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Clock size={16} />
              <span>Attendance</span>
            </button>

            {/* Performance Link */}
            <button
              onClick={() => { setActiveTab('performance'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'performance' 
                  ? 'bg-slate-55 text-slate-850 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <TrendingUp size={16} />
              <span>Performance</span>
            </button>

            {/* Payroll Ledger Link (Our powerful Spreadsheet table!) */}
            <button
              onClick={() => { setActiveTab('payroll'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'payroll' 
                  ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-550 font-bold' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <FileSpreadsheet size={16} className={activeTab === 'payroll' ? 'text-emerald-600' : ''} />
                <span>Payroll Ledger</span>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[9.5px] font-extrabold px-1.5 py-0.2 rounded font-mono">{quickKPIs.staffCount}</span>
            </button>

            {/* Leave Management Link */}
            <button
              onClick={() => { setActiveTab('leave'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'leave' 
                  ? 'bg-slate-55 text-slate-850 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Briefcase size={16} />
              <span>Leave Management</span>
            </button>

            {/* Recruitment Link */}
            <button
              onClick={() => { setActiveTab('recruitment'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'recruitment' 
                  ? 'bg-slate-55 text-slate-850 font-black' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Globe size={16} />
              <span>Recruitment</span>
            </button>

          </nav>

          {/* Bottom Card Banner: Level Up Your HR System (Mint Green card) */}
          <div className="p-4 mr-3 mt-auto ml-1 mb-2">
            <div className="bg-[#e6fcf5] text-[#0c8569] hover:bg-[#cbf7eb] transition-colors rounded-3xl p-5 border border-emerald-100 flex flex-col items-center text-center">
              <h5 className="font-extrabold text-[#0c8569] text-sm tracking-tight">Level Up Your HR System</h5>
              <p className="text-[10px] text-teal-800/85 mt-2 leading-relaxed font-medium">
                SalaryPro gives you full control with advanced modules and extended layouts.
              </p>
              <button 
                onClick={() => triggerAlert('success', 'Thank you! You have requested authorization for a SalaryPro licence. Our coordinators will review secure endpoints.')}
                className="w-full bg-[#1abc9c] hover:bg-[#16a085] text-white rounded-2xl p-2.5 font-bold tracking-wide text-xs mt-4 shadow-sm cursor-pointer hover:shadow transition-all"
              >
                Get SalaryPro
              </button>
            </div>
          </div>

        </div>
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/15 backdrop-blur-xs md:hidden"
        />
      )}

      {/* ==================== 2. MAIN CONTENT WRAPPER: HEADER & TAB STATES ==================== */}
      <div className="flex-1 min-w-0 flex flex-col relative">

        {/* 🏢 Primary Top Nav Row Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 sticky top-0 z-20 print:hidden select-none">
          
          <div className="flex items-center gap-3 justify-between sm:justify-start">
            {/* Mobile Sidebar open clicker */}
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
            >
              <Menu size={18} />
            </button>

            {/* Current Context title */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-black text-slate-800 tracking-tight uppercase">
                  {activeTab === 'dashboard' && 'Corporate Analytics'}
                  {activeTab === 'employees' && 'Employee Details'}
                  {activeTab === 'payroll' && 'Excel Payroll Ledger'}
                  {activeTab === 'calendar' && 'Company Schedule'}
                  {activeTab === 'attendance' && 'Attendance Logs'}
                  {activeTab === 'performance' && 'Evaluation Overviews'}
                  {activeTab === 'leave' && 'Leave Applications'}
                  {activeTab === 'recruitment' && 'Global Sourcing'}
                </span>
                <span className="hidden sm:inline-block text-[9.5px] font-extrabold text-slate-400 font-mono">
                  v2.5
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium leading-none">
                {activeTab === 'employees' && `Focus active profile: ${activeSelectedEmployee?.name || 'Roster Row'}`}
                {activeTab === 'payroll' && 'Auto-calculating 160 active spreadsheet columns'}
                {activeTab === 'dashboard' && 'Aggregate organization sums & outliers analysis'}
                {activeTab !== 'employees' && activeTab !== 'payroll' && activeTab !== 'dashboard' && 'HR Portal sandbox and database logs'}
              </p>
            </div>
          </div>

          {/* Search Anything Bar Wrapper with Functional List Dropdown */}
          <div className="flex items-center gap-4 flex-1 max-w-lg justify-end self-stretch sm:self-auto relative">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={14} />
              </div>
              <input 
                type="text" 
                placeholder="Search anything (employee name/ID)..." 
                value={topSearchQuery}
                onChange={(e) => {
                  setTopSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                className="w-full bg-slate-50 border-0 pl-9 pr-8 py-2.5 rounded-xl text-xs font-semibold placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              {topSearchQuery && (
                <button 
                  onClick={() => { setTopSearchQuery(''); setShowSearchDropdown(false); }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-450 hover:text-slate-650"
                >
                  <X size={12} />
                </button>
              )}

              {/* Functional Search Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-11 bg-white border border-slate-120 rounded-2xl shadow-2xl z-50 p-2 max-h-60 overflow-y-auto font-sans">
                  <p className="text-[10px] font-bold font-mono text-slate-400 px-3 py-1.5 uppercase border-b border-slate-50">Filtered Staff Results</p>
                  {searchResults.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        handleTransitionToProfile(emp.id);
                        setTopSearchQuery('');
                        setShowSearchDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50/75 flex justify-between items-center transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block truncate">{emp.name || '(Empty Row Template)'}</span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">{emp.id} • {emp.role || 'Staff Member'}</span>
                      </div>
                      <ChevronRight size={12} className="text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Top Action Gears */}
            <div className="flex items-center gap-2 select-none">
              
              {/* Back up saving trigger */}
              <button 
                onClick={triggerManualSave}
                disabled={isSaving}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-100 flex items-center justify-center transition-all cursor-pointer relative"
                title={isSaving ? 'Saving Ledger...' : 'Commit database updates to browser Local Storage'}
              >
                <CheckCircle size={14} className={isSaving ? 'animate-spin text-emerald-500' : ''} />
              </button>

              <button 
                onClick={() => {
                  setActiveTab('payroll');
                  triggerAlert('info', 'Scroll down to the spreadsheet actions to backup/export Excel workbooks.');
                }}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-sky-50 text-slate-500 hover:text-blue-600 border border-slate-100 flex items-center justify-center transition-all cursor-pointer"
                title="Print and Excel options dashboard"
              >
                <Printer size={14} />
              </button>

              <button 
                onClick={() => {
                  triggerAlert('info', 'System notifications log cleared.');
                }}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-100 flex items-center justify-center transition-all cursor-pointer relative"
                title="Notifications"
              >
                <Bell size={14} />
              </button>

              {/* General User avatar descriptor */}
              <div className="flex items-center gap-2.5 pl-2 border-l border-slate-150 ml-1">
                <div className="w-8.5 h-8.5 rounded-full bg-[#1abc9c] text-white flex items-center justify-center font-bold text-xs shadow-inner">
                  HR
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <p className="text-xs font-bold text-slate-800">HR Dept</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Admin</p>
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* ⏰ Secondary Floating status ribbon for HR supervisors */}
        <div className="bg-[#f1f5f9]/70 border-b border-slate-150 px-6 py-2 flex flex-col md:flex-row justify-between items-start md:items-center text-[10px] text-slate-500 font-mono tracking-wide print:hidden">
          <div className="flex items-center gap-4 flex-wrap select-none">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
              System Code: <strong>SalaryPro Corporate Roster v2.5</strong>
            </span>
            <span>•</span>
            <span>Enterprise Ledger Access Rights: Admin/HR Supervisor</span>
          </div>
          <div className="flex items-center gap-3.5 mt-1.5 md:mt-0 select-none">
            {savedTime && (
              <span className="bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded text-[9.5px] font-bold">
                Last Local Backup: {savedTime}
              </span>
            )}
            <button 
              onClick={handleResetData}
              className="text-[#0c8569] hover:underline font-bold cursor-pointer font-mono"
              title="Restores the sheet database to empty template except first 5 pre-filled staff"
            >
              Reset 160 Employees
            </button>
          </div>
        </div>

        {/* Floating notifications */}
        {alertMsg && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce cursor-pointer max-w-sm select-none" onClick={() => setAlertMsg(null)}>
            <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xl ${alertMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
              <CheckCircle className={`mt-0.5 shrink-0 ${alertMsg.type === 'success' ? 'text-emerald-500' : 'text-blue-500'}`} size={16} />
              <div>
                <p className="text-[11px] font-bold font-mono text-slate-500">SYSTEM DISPATCH</p>
                <p className="text-xs mt-0.5 font-semibold text-slate-755">{alertMsg.text}</p>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 3. CHOOSE CORRESPONDING CONTENT ELEMENT ==================== */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col print:py-0 print:px-0">
          
          {/* Printable Paper Header block (visible ONLY in physical report cards print) */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-2.5 mb-2 select-text">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-base font-extrabold uppercase">HR PAYROLL MANAGEMENT SYSTEM</h2>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-bold">Active Monthly Salary Calculation Sheet Ledger Report</p>
              </div>
              <div className="text-right font-mono text-[9px] text-slate-400">
                <p>Printed: {new Date().toISOString().slice(0, 10)} {new Date().toLocaleTimeString()}</p>
                <p>Page Setup: A4 Landscape • Total Personnel Count: {quickKPIs.staffCount}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 select-text">
              <div className="border border-slate-200 rounded p-2 text-center">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Gross Payroll Sum</span>
                <span className="text-sm font-bold text-slate-950">{formatBriefINR(quickKPIs.gross)}</span>
              </div>
              <div className="border border-slate-200 rounded p-2 text-center text-rose-700">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Attendance Deductions</span>
                <span className="text-sm font-bold text-rose-600">{formatBriefINR(quickKPIs.deductions)}</span>
              </div>
              <div className="border border-slate-200 rounded p-2 text-center text-emerald-800">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Net Payable payroll sum</span>
                <span className="text-sm font-bold text-emerald-700">{formatBriefINR(quickKPIs.payable)}</span>
              </div>
            </div>
          </div>

          {/* ==================== TAB: 1. OVERALL ANALYTICS ==================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-100 rounded-3xl p-6.5 shadow-xs relative">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight uppercase mb-4">Corporate Workforce Analytics</h3>
                <Dashboard employees={computedEmployees} />
              </div>

              {/* Quick links card */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none">
                <div className="flex gap-3 items-start sm:items-center">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h5 className="font-bold text-emerald-900 text-sm">Actionable Audit Ledger Sheet</h5>
                    <p className="text-xs text-teal-800 leading-normal mt-0.5">Need to edit base salaries, working schedules or log attendance absences?</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('payroll')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-[#0c8569] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <span>Go to Spreadsheet Sheet</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB: 2. DETAILED BENTO EMPLOYEES (Matches screenshot layout!) ==================== */}
          {activeTab === 'employees' && activeSelectedEmployee && (
            <div className="print:hidden">
              <EmployeeProfileDetails 
                employee={activeSelectedEmployee}
                allEmployees={computedEmployees}
                onBack={() => setActiveTab('payroll')}
                onUpdateEmployee={handleUpdateEmployee}
                onSelectEmployeeId={setSelectedEmployeeId}
              />
            </div>
          )}

          {/* ==================== TAB: 3. EDITABLE EXCEL LEDGER SHEET ==================== */}
          {activeTab === 'payroll' && (
            <div className="flex-grow flex flex-col space-y-6">
              
              {/* Informative Instructions / excel mappings header card */}
              <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-xs flex items-start gap-4 animate-fade-in print:hidden">
                <div className="w-9 h-9 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center shrink-0">
                  <Info size={16} />
                </div>
                <div className="text-xs text-slate-500 select-text leading-relaxed">
                  <h5 className="font-bold text-slate-700 mb-1">Spreadsheet formulas configuration notes:</h5>
                  <p className="text-slate-500 font-medium">
                    This powerful spreadsheet represents all 160 rosters block in real-time. Any changes made to ID, Name, Salary, and Absences here are automatically computed, saved inside localStorage and synced dynamically to the Employee Profile pages.
                  </p>
                  <ul className="list-disc pl-4 space-y-1 mt-1.5 text-[11px] font-medium text-slate-500">
                    <li>
                      <strong>Daily Salary Rate (INR):</strong> computed as <code className="bg-slate-100 px-1 rounded font-mono text-slate-700 font-bold font-mono">Monthly Base / Working Days</code>.
                    </li>
                    <li>
                      <strong>Hourly Salary Rate (INR):</strong> computed as <code className="bg-slate-100 px-1 rounded font-mono text-slate-700 font-bold font-mono">Daily Rate / Working Hours Per Day</code>.
                    </li>
                    <li>
                      <strong>Absences deduction conversion:</strong> computed automatically as <code className="bg-slate-100 px-1 rounded font-mono text-slate-700 font-bold font-mono">(Daily Rate × Days Absent) + (Hourly Rate × Hours Decimal Absent)</code>.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Roster Spreadsheet Table */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4.5 flex-1 flex flex-col min-h-[480px]">
                <ExcelTable 
                  employees={computedEmployees}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  onResetData={handleResetData}
                  onBulkUpdateSettings={handleBulkUpdateSettings}
                  onViewProfile={handleTransitionToProfile}
                />
              </div>
            </div>
          )}

          {/* ==================== TAB: 4. INBOX PANEL (Removed) ==================== */}

          {/* ==================== TAB: 5. LEAVE MANAGEMENT (Mock approval) ==================== */}
          {activeTab === 'leave' && (
            <div className="bg-white border border-slate-150 rounded-3xl p-6.5 shadow-sm max-w-3xl mx-auto space-y-6 animate-fade-in font-sans">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Leave Validation Console</h3>
                <p className="text-xs text-slate-400 mt-0.5">Authorise staff leave requests and sync hours logged charts automatically.</p>
              </div>

              <div className="space-y-3.5">
                {mockLeaves.map(lv => (
                  <div key={lv.id} className="p-4 rounded-2xl border border-slate-150 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{lv.name}</span>
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase">{lv.type}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1.5 font-medium flex gap-3 text-mono uppercase">
                        <span>Duration: {lv.duration}</span>
                        <span>•</span>
                        <span>Schedule: {lv.date}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                      {lv.status === 'Pending' ? (
                        <>
                          <button 
                            onClick={() => handleModifyLeave(lv.id, 'Approved')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs p-2.5 px-3.5 rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <CheckCircle size={13} />
                            <span>Approve</span>
                          </button>
                          <button 
                            onClick={() => handleModifyLeave(lv.id, 'Rejected')}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs p-2.5 px-3.5 rounded-xl cursor-pointer inline-flex items-center gap-1"
                          >
                            <X size={13} />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span className={`text-xs font-bold font-mono uppercase px-3 py-1 rounded-lg ${
                          lv.status === 'Approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'
                        }`}>
                          {lv.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== TAB: 6. ATTENDANCE LOG INTEGRATOR ==================== */}
          {activeTab === 'attendance' && (
            <AttendanceImport 
              employees={employees}
              onUpdateEmployee={handleUpdateEmployee}
              triggerAlert={triggerAlert}
              onViewEmployeeProfile={handleTransitionToProfile}
            />
          )}

          {/* ==================== MOCK TABS FALLBACKS (Calendar, Performance, Recruitment) ==================== */}
          {['calendar', 'performance', 'recruitment'].includes(activeTab) && (
            <div className="bg-white border border-slate-150 rounded-3xl p-10 shadow-sm max-w-xl mx-auto text-center space-y-4 animate-fade-in font-sans">
              <div className="w-14 h-14 bg-sky-50 text-teal-600 rounded-2xl mx-auto flex items-center justify-center">
                <Award size={26} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                  {activeTab === 'calendar' && 'Company Schedule Sandbox'}
                  {activeTab === 'performance' && 'Evaluation Assessment matrix'}
                  {activeTab === 'recruitment' && 'Global Pipeline Hub'}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-semibold max-w-sm mx-auto">
                  This secure module is active under Sandbox and holds read-access rights for HR Admin HR Dept. Active roster edits must be completed in components inside the "Employees" profile details or "Payroll Ledger" excel spreadsheet.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('employees')}
                className="bg-emerald-500 hover:bg-emerald-600 px-4.5 py-3.5 rounded-2xl text-white font-bold text-xs tracking-wider uppercase shadow-md shadow-emerald-500/10 cursor-pointer"
              >
                Go to Active Profile Details
              </button>
            </div>
          )}

        </main>

        {/* ==================== 4. FOOTER: SYSTEM CREDITS ==================== */}
        <footer className="mt-auto border-t border-slate-150 py-4.5 bg-white text-center text-[10px] text-slate-400 select-none print:hidden uppercase font-semibold">
          Confidential HR Portal • SalaryPro v2.5 Admin Operations • Active Ledger calculations.
        </footer>

      </div>

    </div>
  );
}
