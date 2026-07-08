/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ComputedEmployee, Employee } from '../types';
import { isEmployeePresent, getWorkMinutes, getAdjustedPunches, getNextDateStr } from '../data';
import { collection, onSnapshot, doc, setDoc, deleteDoc, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  ArrowLeft, 
  Calendar, 
  Mail, 
  Phone, 
  MapPin, 
  Linkedin, 
  Twitter, 
  Instagram, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  FileText, 
  Upload, 
  Wallet,
  Coins,
  ChevronLeft, 
  ChevronRight, 
  Award, 
  MessageSquare, 
  TrendingUp, 
  Briefcase, 
  Globe, 
  Paperclip,
  User,
  MoreHorizontal,
  Clock,
  Info,
  Search,
  Timer,
  Zap
} from 'lucide-react';

interface EmployeeProfileDetailsProps {
  employee: ComputedEmployee;
  allEmployees: ComputedEmployee[];
  onBack: () => void;
  onUpdateEmployee: (id: string, updatedFields: Partial<Employee>) => void;
  onSelectEmployeeId: (id: string) => void;
  viewOnly?: boolean;
  allPunchLogs?: Record<string, Record<string, string[]>>;
  setAllPunchLogs?: React.Dispatch<React.SetStateAction<Record<string, Record<string, string[]>>>>;
  ledgerMonth?: number;
  ledgerYear?: number;
  triggerAlert?: (type: 'success' | 'info' | 'warn', text: string) => void;
}

// Helper calculating break time
const calculateBreakTime = (punches: string[]): { hours: number; minutes: number; formatted: string } => {
  if (!punches || punches.length < 3 || !isEmployeePresent(punches)) {
    return { hours: 0, minutes: 0, formatted: '-' };
  }

  let totalBreakMinutes = 0;
  let activeOutTime: { h: number; m: number } | null = null;

  punches.forEach(p => {
    const parts = p.trim().split(' ');
    if (parts.length < 2) return;
    const timeStr = parts[0];
    const type = parts.slice(1).join(' ').toUpperCase();

    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (isNaN(h) || isNaN(m)) return;

    const isCheckIn = type.startsWith('IN') || type.startsWith('ARR') || type.includes('IN') || type.includes('ARR');
    const isCheckOut = type.startsWith('OUT') || type.includes('OUT') || type.includes('DEP') || type.includes('EXIT');

    if (isCheckOut) {
      activeOutTime = { h, m };
    } else if (isCheckIn && activeOutTime) {
      const startBreakMin = activeOutTime.h * 60 + activeOutTime.m;
      const endBreakMin = h * 60 + m;
      if (endBreakMin > startBreakMin) {
        totalBreakMinutes += (endBreakMin - startBreakMin);
      }
      activeOutTime = null;
    }
  });

  const hrs = Math.floor(totalBreakMinutes / 60);
  const actualMins = totalBreakMinutes % 60;

  if (totalBreakMinutes === 0) {
    return { hours: 0, minutes: 0, formatted: '-' };
  }

  return {
    hours: hrs,
    minutes: actualMins,
    formatted: `${hrs}h ${actualMins}m`
  };
};

// Helper calculating single gate pass minutes duration
const calculateGatePassMinutes = (outTime: string, inTime: string): number => {
  if (!outTime || !inTime) return 0;
  const [outH, outM] = outTime.split(':').map(Number);
  const [inH, inM] = inTime.split(':').map(Number);
  if (isNaN(outH) || isNaN(outM) || isNaN(inH) || isNaN(inM)) return 0;
  
  const outTotal = outH * 60 + outM;
  const inTotal = inH * 60 + inM;
  if (inTotal > outTotal) {
    return inTotal - outTotal;
  }
  return 0;
};

// Helper calculating single gate pass minutes duration, considering Shift end-time if No Return
const getGatePassMinutesWithShift = (gp: any, shiftTimeStr: string | undefined): number => {
  if (!gp.outTime) return 0;
  
  const inTimeStr = gp.inTime || '';
  const isNoReturn = inTimeStr.trim().toLowerCase() === 'no-return' || inTimeStr.trim().toLowerCase() === 'no return';
  
  if (isNoReturn) {
    const shiftTime = shiftTimeStr || '08:00 - 17:00';
    const parts = shiftTime.split('-');
    if (parts.length < 2) return 0;
    const endTimeStr = parts[1].trim();
    
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const [outH, outM] = gp.outTime.split(':').map(Number);
    
    if (isNaN(endH) || isNaN(endM) || isNaN(outH) || isNaN(outM)) return 0;
    
    const endTotal = endH * 60 + endM;
    const outTotal = outH * 60 + outM;
    
    if (endTotal > outTotal) {
      return endTotal - outTotal;
    }
    return 0;
  }
  
  return calculateGatePassMinutes(gp.outTime, gp.inTime);
};

// Helper calculating overtime logs duration
const calculateHoursWorked = (arr: string, out: string) => {
  if (!arr || !out) return 0;
  const [arrHrs, arrMins] = arr.split(':').map(Number);
  const [outHrs, outMins] = out.split(':').map(Number);
  if (isNaN(arrHrs) || isNaN(arrMins) || isNaN(outHrs) || isNaN(outMins)) return 0;
  
  let diffMins = (outHrs * 60 + outMins) - (arrHrs * 60 + arrMins);
  if (diffMins < 0) {
    diffMins += 24 * 60; // Over midnight Cross
  }
  return diffMins / 60;
};

const monthsList = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeeProfileDetails({
  employee,
  allEmployees,
  onBack,
  onUpdateEmployee,
  onSelectEmployeeId,
  viewOnly = false,
  allPunchLogs = {},
  setAllPunchLogs,
  ledgerMonth = 5,
  ledgerYear = 2026,
  triggerAlert
}: EmployeeProfileDetailsProps) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedRole, setEditedRole] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAddress, setEditedAddress] = useState('');
  const [editedDob, setEditedDob] = useState('');
  const [editedShiftTime, setEditedShiftTime] = useState('08:00 - 17:00');
  const [editedShift, setEditedShift] = useState<'DAY' | 'NIGHT'>('DAY');
  const [editedGender, setEditedGender] = useState('Female');
  const [editedDepartment, setEditedDepartment] = useState('');
  const [editedDesignation, setEditedDesignation] = useState('');
  const [editedSalaryType, setEditedSalaryType] = useState<'fixed' | 'daily'>('fixed');
  const [editedSundayPaid, setEditedSundayPaid] = useState<'Paid' | 'Not Paid'>('Not Paid');
  const [editedMonthlySalary, setEditedMonthlySalary] = useState<number>(0);

  // Interactive local states for Notes & Documents
  const [newNote, setNewNote] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocSize, setNewDocSize] = useState('1.5 MB');

  // Autocomplete select search state
  const [selectSearchQuery, setSelectSearchQuery] = useState('');

  // Filtered employees listing based on freeform string query
  const filteredSelectEmployees = useMemo(() => {
    if (!selectSearchQuery.trim()) return allEmployees;
    const q = selectSearchQuery.toLowerCase();
    return allEmployees.filter(emp => 
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.id || '').toLowerCase().includes(q)
    );
  }, [allEmployees, selectSearchQuery]);

  // Calendar Year & Month state
  const [calendarYear, setCalendarYear] = useState(() => ledgerYear);
  const [calendarMonth, setCalendarMonth] = useState(() => ledgerMonth - 1); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number>(25); // Default to today: 25th

  // Keep calendar view in sync with ledger selections when props update
  useEffect(() => {
    setCalendarYear(ledgerYear);
    setCalendarMonth(ledgerMonth - 1);
  }, [ledgerMonth, ledgerYear]);

  // Subcollection real-time punches log state
  const [punchLogs, setPunchLogs] = useState<Record<string, { id: string; employeeId: string; date: string; punches: string[] }>>({});

  // Real-time tracking of all uploaded logs in entire application to find unique dates dynamically
  const allUploadedDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(allPunchLogs || {}).forEach(empPunches => {
      Object.entries(empPunches || {}).forEach(([dateStr, punches]) => {
        if (punches && punches.length > 0) {
          const hasInOrArr = punches.some(p => {
            const uc = p.toUpperCase();
            return uc.includes('IN') || uc.includes('ARR');
          });
          if (hasInOrArr) {
            dates.add(dateStr);
          }
        }
      });
    });
    return Array.from(dates).sort();
  }, [allPunchLogs]);

  // Synchronous punch logs mapping from the preloaded allPunchLogs prop
  useEffect(() => {
    if (!employee.id) return;
    const empPunches = allPunchLogs[employee.id] || {};
    const formatted: Record<string, any> = {};
    Object.keys(empPunches).forEach(date => {
      formatted[date] = {
        id: date,
        employeeId: employee.id,
        date: date,
        punches: empPunches[date]
      };
    });
    setPunchLogs(formatted);
  }, [employee.id, allPunchLogs]);

  // Load specific month's punches dynamically when navigating on profile calendar
  useEffect(() => {
    if (!employee.id) return;

    const fetchCalendarMonthPunches = async () => {
      const monthStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-31`;

      try {
        const punchesQuery = query(
          collection(db, 'employees', employee.id, 'punches'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );
        const punchesSnap = await getDocs(punchesQuery);
        
        const statePatch: Record<string, string[]> = {};
        let hasNewOrDiff = false;

        const empCurrentPunches = allPunchLogs[employee.id] || {};

        punchesSnap.forEach(docSnap => {
          const punchesData = docSnap.data().punches || [];
          const date = docSnap.id;
          if (date) {
            statePatch[date] = punchesData;
            const existingPunches = empCurrentPunches[date];
            if (!existingPunches || JSON.stringify(existingPunches) !== JSON.stringify(punchesData)) {
              hasNewOrDiff = true;
            }
          }
        });

        if (hasNewOrDiff && setAllPunchLogs) {
          setAllPunchLogs(prev => {
            const next = { ...prev };
            next[employee.id] = {
              ...(next[employee.id] || {}),
              ...statePatch
            };
            localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to dynamically fetch navigated month punch logs:", err);
      }
    };

    fetchCalendarMonthPunches();
  }, [employee.id, calendarMonth, calendarYear, setAllPunchLogs]);



  // Real-time subscribed gate pass records for the selected employee
  const [employeeGatePasses, setEmployeeGatePasses] = useState<any[]>([]);

  useEffect(() => {
    if (!employee.id) return;
    const q = collection(db, 'gatePasses');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.employeeId === employee.id) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      // Sort by date descending
      list.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
      setEmployeeGatePasses(list);
    }, (err) => {
      console.error("Failed to stream gate passes for employee profile", err);
    });
    return () => unsubscribe();
  }, [employee.id]);

  // Real-time subscribed overtime logs for the selected employee
  const [employeeOvertimeLogs, setEmployeeOvertimeLogs] = useState<any[]>([]);
  const [employeeAdvanceHistory, setEmployeeAdvanceHistory] = useState<any[]>([]);
  const [otFilterMonth, setOtFilterMonth] = useState<number>(() => ledgerMonth ? ledgerMonth - 1 : new Date().getMonth()); // 0-indexed
  const [otFilterYear, setOtFilterYear] = useState<number>(() => ledgerYear || new Date().getFullYear());

  useEffect(() => {
    if (ledgerMonth) setOtFilterMonth(ledgerMonth - 1);
    if (ledgerYear) setOtFilterYear(ledgerYear);
  }, [ledgerMonth, ledgerYear]);

  // Sync otFilter values automatically with ATTENDANCE MAP navigation selections
  useEffect(() => {
    setOtFilterMonth(calendarMonth);
    setOtFilterYear(calendarYear);
  }, [calendarMonth, calendarYear]);

  useEffect(() => {
    if (!employee.id) return;
    const q = collection(db, 'overtimeLogs');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.employeeId === employee.id) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      // Sort by date descending
      list.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
      setEmployeeOvertimeLogs(list);
    }, (err) => {
      console.error("Failed to stream overtime logs for employee profile", err);
    });
    return () => unsubscribe();
  }, [employee.id]);

  useEffect(() => {
    if (!employee.id) return;
    const q = collection(db, 'employees', employee.id, 'monthlyPayroll');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.advances && Array.isArray(data.advances) && data.advances.length > 0) {
          data.advances.forEach((adv: any) => {
            list.push({
              id: `${docSnap.id}-${adv.id}`,
              monthYear: docSnap.id,
              amount: Number(adv.amount) || 0,
              date: adv.date || '',
              remarks: adv.remarks || ''
            });
          });
        } else if (data.advancePayment && Number(data.advancePayment) > 0) {
          list.push({
            id: docSnap.id,
            monthYear: docSnap.id,
            amount: Number(data.advancePayment) || 0,
            date: data.advanceDate || '',
            remarks: data.advanceRemarks || ''
          });
        }
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      setEmployeeAdvanceHistory(list);
    }, (err) => {
      console.error("Failed to stream advance history", err);
    });
    return () => unsubscribe();
  }, [employee.id]);

  const filteredOtLogs = useMemo(() => {
    return employeeOvertimeLogs.filter(log => {
      if (!log.date) return false;
      const parts = log.date.split('-');
      if (parts.length < 3) return false;
      const logYear = parseInt(parts[0], 10);
      const logMonth = parseInt(parts[1], 10) - 1; // Convert 1-12 to 0-11
      return logYear === otFilterYear && logMonth === otFilterMonth;
    });
  }, [employeeOvertimeLogs, otFilterMonth, otFilterYear]);

  const filteredAdvanceHistory = useMemo(() => {
    const targetMonthYearStr = `${otFilterYear}-${String(otFilterMonth + 1).padStart(2, '0')}`;
    return employeeAdvanceHistory.filter(adv => adv.monthYear === targetMonthYearStr);
  }, [employeeAdvanceHistory, otFilterMonth, otFilterYear]);

  const totalOtHours = useMemo(() => {
    let total = 0;
    filteredOtLogs.forEach(log => {
      const hours = calculateHoursWorked(log.arrTime, log.outTime);
      total += hours;
    });
    return total;
  }, [filteredOtLogs]);

  const otRates = useMemo(() => {
    const otWorkingDays = new Date(otFilterYear, otFilterMonth + 1, 0).getDate();
    const otWorkingHoursPerDay = employee.workingHours || 8;
    const otIsDailyBasis = employee.salaryType === 'daily';
    const baseSalaryForOt = employee.monthlySalary || 0;
    
    const otDailyRate = otIsDailyBasis ? baseSalaryForOt : (baseSalaryForOt > 0 && otWorkingDays > 0 ? baseSalaryForOt / otWorkingDays : 0);
    const otHourlyRate = otDailyRate > 0 && otWorkingHoursPerDay > 0 ? otDailyRate / otWorkingHoursPerDay : 0;
    return {
      dailyRate: otDailyRate,
      hourlyRate: otHourlyRate,
      isDailyBasis: otIsDailyBasis
    };
  }, [employee.monthlySalary, employee.workingHours, employee.salaryType, otFilterMonth, otFilterYear]);

  const totalOtAmount = useMemo(() => {
    let totalAmount = 0;
    filteredOtLogs.forEach(log => {
      const hours = calculateHoursWorked(log.arrTime, log.outTime);
      totalAmount += (hours / 12) * otRates.dailyRate;
    });
    return totalAmount;
  }, [filteredOtLogs, otRates.dailyRate]);

  const startProfileEdit = () => {
    if (viewOnly) {
      alert("Access Restricted. Editing employee details is locked in read-only observer sessions.");
      return;
    }
    setEditedName(employee.name || 'Employee Name');
    setEditedRole(employee.role || 'Unassigned');
    setEditedEmail(employee.email || '');
    setEditedPhone(employee.phone || '');
    setEditedAddress(employee.address || '');
    setEditedDob(employee.dob || '');
    setEditedShiftTime(employee.shiftTime || '08:00 - 17:00');
    setEditedShift(employee.shift || 'DAY');
    setEditedGender(employee.gender || 'Female');
    setEditedDepartment(employee.department || 'Unassigned');
    setEditedDesignation(employee.designation || employee.role || 'Unassigned');
    setEditedSalaryType(employee.salaryType || 'fixed');
    setEditedSundayPaid(employee.sundayPaid || 'Not Paid');
    setEditedMonthlySalary(employee.monthlySalary || 0);
    setIsEditingProfile(true);
  };

  const handleSaveProfile = () => {
    onUpdateEmployee(employee.id, {
      name: editedName,
      role: editedRole || editedDesignation,
      email: editedEmail,
      phone: editedPhone,
      address: editedAddress,
      dob: editedDob,
      shiftTime: editedShiftTime,
      shift: editedShift,
      gender: editedGender,
      department: editedDepartment,
      designation: editedDesignation,
      salaryType: editedSalaryType,
      sundayPaid: editedSundayPaid,
      monthlySalary: editedMonthlySalary
    });
    setIsEditingProfile(false);
  };

  // Safe Fallback defaults
  const currentRole = employee.role || 'Unassigned';
  const currentDepartment = employee.department || 'Unassigned';
  const currentDesignation = employee.designation || employee.role || 'Unassigned';
  const currentEmail = employee.email || '—';
  const currentPhone = employee.phone || '—';
  const currentAddress = employee.address || '—';
  const currentDob = employee.dob || '—';
  const currentShiftTime = employee.shiftTime || '08:00 - 17:00';
  const currentGender = employee.gender || 'Female';

  const documentsList = employee.documents || [];

  const notesList = employee.notes || [];

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      alert("Access Restricted. Notes cannot be added in read-only observer sessions.");
      return;
    }
    if (!newNote.trim()) return;
    const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedNote = `${newNote.trim()} (${dateStr})`;
    onUpdateEmployee(employee.id, {
      notes: [formattedNote, ...notesList]
    });
    setNewNote('');
  };

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      alert("Access Restricted. Document uploading is disabled in read-only observer sessions.");
      return;
    }
    if (!newDocName.trim()) return;
    const nameWithExt = newDocName.endsWith('.pdf') ? newDocName.trim() : `${newDocName.trim()}.pdf`;
    const newDoc = {
      name: nameWithExt,
      size: newDocSize,
      date: new Date().toISOString().slice(0, 10)
    };
    onUpdateEmployee(employee.id, {
      documents: [newDoc, ...documentsList]
    });
    setNewDocName('');
  };

  const handleDeleteDocument = (index: number) => {
    if (viewOnly) {
      alert("Access Restricted. Document deletions are disabled in read-only observer sessions.");
      return;
    }
    const updated = documentsList.filter((_, i) => i !== index);
    onUpdateEmployee(employee.id, {
      documents: updated
    });
  };

  // Indian Rupee custom formatting
  const formatINR = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Calculated Allowances & Benefits
  const baseSalary = employee.monthlySalary || 0;
  // Allowances: proportional to base (10% transport, 5% meal, 3% internet) if they are active
  const allowanceTransport = Math.round(baseSalary * 0.08);
  const allowanceMeal = Math.round(baseSalary * 0.05);
  const allowanceInternet = Math.round(baseSalary * 0.03);
  
  // Benefits: health insurance (6% base), life insurance (3%), company device mock values
  const benefitHealth = Math.round(baseSalary * 0.06);
  const benefitLife = Math.round(baseSalary * 0.02);
  const benefitDevice = Math.round(baseSalary * 0.015);

  const totalMonthlyValue = baseSalary + allowanceTransport + allowanceMeal + allowanceInternet + benefitHealth + benefitLife + benefitDevice;

  const getAdjustedPunchesForDate = (dateStr: string): string[] => {
    return getAdjustedPunches(employee.id, employee.shift, dateStr, allPunchLogs);
  };

  // Live dynamic absences count! Filter uploaded dates for current month/year and check if this employee has no punches
  const currentMonthStr = String(calendarMonth + 1).padStart(2, '0');
  const monthPrefix = `${calendarYear}-${currentMonthStr}-`;
  
  const now = new Date();
  const isFutureMonth = (calendarYear > now.getFullYear()) || (calendarYear === now.getFullYear() && calendarMonth > now.getMonth());
  const isCurrentlyLedgerMonth = (calendarMonth + 1 === ledgerMonth && calendarYear === ledgerYear);
  
  // Real-time tracking of uploaded dates filtered for the selected month to determine active company work days
  const uploadedDaysInThisMonth = useMemo(() => {
    return allUploadedDates.filter(d => d.startsWith(monthPrefix));
  }, [allUploadedDates, monthPrefix]);
  
  const uploadedFullAbsencesCount = uploadedDaysInThisMonth.filter(d => {
    const dayPunches = getAdjustedPunchesForDate(d);
    if (dayPunches.length === 0) {
      const dateObj = new Date(d);
      const isSunday = dateObj.getDay() === 0;
      const isFixed = (employee.salaryType || 'fixed') === 'fixed';
      if (isSunday && isFixed) {
        if (employee.sundayPaid === 'Not Paid') {
          return true;
        }
        return false; // Absent on Sunday is not counted for fixed basis salary employees if Sunday is Paid
      }
      return true;
    }
    return false;
  }).length;

  const uploadedPartialDays = uploadedDaysInThisMonth.filter(d => {
    const dayPunches = getAdjustedPunchesForDate(d);
    if (dayPunches.length > 0) {
      const minutes = getWorkMinutes(dayPunches);
      return minutes < 480;
    }
    return false;
  }).map(d => {
    const dayPunches = getAdjustedPunchesForDate(d);
    return { date: d, minutes: getWorkMinutes(dayPunches) };
  });

  const absencesCount = uploadedDaysInThisMonth.length > 0 
    ? uploadedFullAbsencesCount 
    : (isCurrentlyLedgerMonth ? (employee.fullDaysAbsent || 0) : 0);

  const partialDaysList = uploadedDaysInThisMonth.length > 0
    ? uploadedPartialDays
    : (employee.partialDays || []);

  // Circular stats dynamic progress
  const leavesTaken = Math.min(20, Math.round(14 - absencesCount));
  const leavesMax = 20;

  // Let's perform precise live salary and deduction calculations based on actual live monthly absences for the new Salary & Deductions Breakdown Card
  const workingDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const workingHoursPerDay = employee.workingHours || 8;
  const isDailyBasis = employee.salaryType === 'daily';
  
  const dynamicDailyRate = isDailyBasis ? baseSalary : (baseSalary > 0 && workingDays > 0 ? baseSalary/workingDays : 0);
  const dynamicHourlyRate = dynamicDailyRate > 0 && workingHoursPerDay > 0 ? dynamicDailyRate / workingHoursPerDay : 0;
  
  const elapsedDays = uploadedDaysInThisMonth.length > 0 ? uploadedDaysInThisMonth.length : workingDays;
  const grossMonthlyBasis = isDailyBasis 
    ? (baseSalary * elapsedDays) 
    : (uploadedDaysInThisMonth.length > 0 ? (dynamicDailyRate * elapsedDays) : baseSalary);

  // Calculate live Sunday OT days based on punches
  let liveSundayOTDays = 0;
  if (uploadedDaysInThisMonth.length > 0) {
    uploadedDaysInThisMonth.forEach(d => {
      const dayPunches = getAdjustedPunchesForDate(d);
      if (dayPunches.length > 0) {
        const dateObj = new Date(d);
        const isSunday = dateObj.getDay() === 0;
        const isFixed = (employee.salaryType || 'fixed') === 'fixed';
        if (isSunday && isFixed && employee.sundayPaid === 'Paid') {
          liveSundayOTDays++;
        }
      }
    });
  } else {
    liveSundayOTDays = employee.sundayOTDays || 0;
  }

  const isFixed = employee.salaryType === 'fixed';
  const liveSundayOTAmount = (isFixed && employee.sundayPaid === 'Paid') ? (liveSundayOTDays * dynamicDailyRate) : 0;
  
  // Overtime logs for the specific active ledger month & year
  const calendarMonthlyOtLogs = employeeOvertimeLogs.filter(log => {
    if (!log.date) return false;
    const parts = log.date.split('-');
    if (parts.length < 3) return false;
    const logYear = parseInt(parts[0], 10);
    const logMonth = parseInt(parts[1], 10) - 1; // Convert 1-12 to 0-11
    return logYear === calendarYear && logMonth === calendarMonth;
  });

  const calendarMonthlyOtHours = calendarMonthlyOtLogs.reduce((acc, log) => {
    return acc + calculateHoursWorked(log.arrTime, log.outTime);
  }, 0);

  const calendarMonthlyOtAmount = calendarMonthlyOtLogs.reduce((acc, log) => {
    const hours = calculateHoursWorked(log.arrTime, log.outTime);
    return acc + (hours / 12) * dynamicDailyRate;
  }, 0);
  
  const liveDeductionFullDay = dynamicDailyRate * absencesCount;
  const liveTotalAbsentHours = (employee.absentHours || 0) + ((employee.absentMinutes || 0) / 60);
  const liveDeductionHourly = dynamicHourlyRate * liveTotalAbsentHours;

  let liveDeductionPartialDay = 0;
  partialDaysList.forEach(pd => {
    const workedHours = pd.minutes / 60;
    const unworkedHours = Math.max(0, workingHoursPerDay - workedHours);
    liveDeductionPartialDay += unworkedHours * dynamicHourlyRate;
  });
  
  const liveDeductionBiometrics = liveDeductionFullDay + liveDeductionHourly + liveDeductionPartialDay;
  
  const advance = Number(employee.advancePayment) || 0;
  const food = Number(employee.foodBalance) || 0;
  const liveTotalPayCuts = liveDeductionBiometrics + advance + food;
  
  const liveFinalPayable = Math.max(0, grossMonthlyBasis + liveSundayOTAmount + calendarMonthlyOtAmount - liveTotalPayCuts);

  const monthlyGatePasses = useMemo(() => {
    return employeeGatePasses.filter(gp => {
      if (!gp.date) return false; // YYYY-MM-DD
      const parts = gp.date.split('-');
      if (parts.length < 2) return false;
      const gpYear = parseInt(parts[0], 10);
      const gpMonth = parseInt(parts[1], 10) - 1; // 0-indexed
      return gpYear === calendarYear && gpMonth === calendarMonth;
    });
  }, [employeeGatePasses, calendarMonth, calendarYear]);

  const { totalGateMinutes, totalGateHoursAndMinsString, totalGatePassCount } = useMemo(() => {
    let totalMins = 0;
    monthlyGatePasses.forEach(gp => {
      totalMins += getGatePassMinutesWithShift(gp, employee.shiftTime);
    });
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    
    let timeStr = '';
    if (h > 0) {
      timeStr += `${h} hr `;
    }
    timeStr += `${m} min`;
    
    return {
      totalGateMinutes: totalMins,
      totalGateHoursAndMinsString: totalMins > 0 ? timeStr : '0 min',
      totalGatePassCount: monthlyGatePasses.length
    };
  }, [monthlyGatePasses, employee.shiftTime]);

  // Month navigation names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  // Generate calendar days
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const presentDaysCount = Math.max(0, elapsedDays - absencesCount);
  const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const punchesList = getAdjustedPunchesForDate(targetDate);
  const selectedDateBreakObj = calculateBreakTime(punchesList);
  const breakTimeMins = selectedDateBreakObj.hours * 60 + selectedDateBreakObj.minutes;
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // Sunday is 0
  const prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();

  const calendarDays = [];
  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarDays.push({ day: prevMonthDays - i, isCurrentMonth: false });
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ day: i, isCurrentMonth: true });
  }
  // Next month leading days (fill grid to multiple of 7)
  const totalSlotsNeeded = Math.ceil(calendarDays.length / 7) * 7;
  const nextDaysCount = totalSlotsNeeded - calendarDays.length;
  for (let i = 1; i <= nextDaysCount; i++) {
    calendarDays.push({ day: i, isCurrentMonth: false });
  }

  // Highlight specific calendar days based on the employee's absent data dynamically and realistically!
  // If employee has absences, let's mark the calendar with absent (red) or late (yellow)
  const isAbsentDay = (dayNum: number, isCurrent: boolean) => {
    if (!isCurrent) return false;
    if (isFutureMonth) return false;
    const cellDateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    
    // 1. If this month features ANY uploaded biometric logs, rely strictly and exclusively on those logs
    if (uploadedDaysInThisMonth.length > 0) {
      if (uploadedDaysInThisMonth.includes(cellDateStr)) {
        const dayPunches = getAdjustedPunchesForDate(cellDateStr);
        const absent = !isEmployeePresent(dayPunches);
        if (absent) {
          const dateObj = new Date(cellDateStr);
          const isSunday = dateObj.getDay() === 0;
          const isFixed = (employee.salaryType || 'fixed') === 'fixed';
          if (isSunday && isFixed) {
            if (employee.sundayPaid === 'Not Paid') {
              return true;
            }
            return false;
          }
        }
        return absent;
      }
      return false; // No fake absences shown
    }

    // 2. Fallback to hash-based indicator of manual entries ONLY when no biometric logs have been imported at all for this month
    if (absencesCount === 0) return false;
    const offset = parseInt(employee.id.replace(/[^\d]/g, '')) || 1;
    const absentDates = [];
    for (let c = 0; c < absencesCount; c++) {
      absentDates.push(((offset * 7 + c * 9) % 28) + 1);
    }
    return absentDates.includes(dayNum);
  };

  const isLateDay = (dayNum: number, isCurrent: boolean) => {
    if (!isCurrent) return false;
    const cellDateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    if (uploadedDaysInThisMonth.length > 0) {
      if (uploadedDaysInThisMonth.includes(cellDateStr)) {
        const dayPunches = getAdjustedPunchesForDate(cellDateStr);
        // An odd number of logs or incomplete punches can visually count as special lates/exceptions
        return dayPunches.length > 0 && dayPunches.length % 2 !== 0;
      }
      return false;
    }

    if (!isCurrentlyLedgerMonth) return false;
    const hasHourlyAbsence = employee.absentHours > 0 || employee.absentMinutes > 0;
    if (!hasHourlyAbsence) return false;
    const offset = parseInt(employee.id.replace(/[^\d]/g, '')) || 2;
    const lateDates = [((offset * 13) % 28) + 1];
    return lateDates.includes(dayNum);
  };

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in select-text pb-10" id="employee-detail-panel">
      
      {/* 🧭 Top Navigation Path and Search bar row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-teal-600 transition-colors cursor-pointer text-sm font-semibold group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span>Employee Details</span>
          </button>
          <p className="text-xs text-slate-400 mt-1 select-none font-medium">
            Dashboard / <span className="text-teal-600 font-semibold">{employee.name || 'Anonymous Row'}</span> / Employee Details
          </p>
        </div>

        {/* Quick Employee Selector with Search input for swift autocomplete searching */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full md:w-auto self-stretch md:self-auto">
          <div className="relative flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap hidden lg:block">Search Profile:</span>
            <div className="relative w-full sm:w-44">
              <input 
                type="text" 
                placeholder="Type name or ID to filter..." 
                value={selectSearchQuery}
                onChange={(e) => setSelectSearchQuery(e.target.value)}
                className="bg-white border border-slate-200 text-xs font-semibold rounded-lg pl-3 pr-8 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden w-full placeholder-slate-450 text-slate-800"
              />
              {selectSearchQuery ? (
                <button 
                  onClick={() => setSelectSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 cursor-pointer focus:outline-hidden"
                  type="button"
                >
                  <X size={11} />
                </button>
              ) : (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-350 pointer-events-none">
                  <Search size={11} />
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap hidden sm:block lg:hidden">Select:</span>
            <select 
              value={employee.id}
              onChange={(e) => {
                onSelectEmployeeId(e.target.value);
                setSelectSearchQuery('');
              }}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-extrabold rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden min-w-[210px] flex-1 sm:flex-none uppercase"
            >
              {filteredSelectEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.id.startsWith('EMP_TEMP_') ? `[Empty Row] ${emp.id}` : `${emp.id} - ${emp.name || 'Anonymous'}`}
                </option>
              ))}
              {filteredSelectEmployees.length === 0 && (
                <option disabled>No records matched</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* 🍱 Core Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ==================== LEFT COLUMN: PERSONAL PROFILE (3/12 cols) ==================== */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Profile Card Summary */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 lg:p-6 flex flex-col relative overflow-hidden group">
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
              <button 
                onClick={startProfileEdit}
                className="p-1 px-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-teal-50 hover:text-teal-600 border border-slate-100 transition-all font-semibold text-xs cursor-pointer flex items-center gap-1"
                title="Edit Employee Information"
              >
                <Edit2 size={11} />
                <span>Edit</span>
              </button>
            </div>

            {/* Top Row: Avatar and Name Brief (Horizontal flex on mobile/tablet, vertical on desktop) */}
            <div className="flex flex-row lg:flex-col items-center lg:text-center gap-4 w-full">
              {/* Mint Green Avatar Square Box (Exactly like screenshot) */}
              <div className="w-14 h-14 sm:w-20 sm:h-20 lg:w-28 lg:h-28 bg-[#1abc9c]/25 rounded-2xl lg:rounded-3xl flex items-center justify-center text-[#16a085] text-xl sm:text-2xl lg:text-4xl shadow-inner relative group-hover:scale-105 transition-transform shrink-0">
                {employee.name ? employee.name.charAt(0) : '?'}
                <span className="absolute bottom-1 right-1 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full border-2 sm:border-4 border-white" title="Active Workforce status"></span>
              </div>

              {/* Name and Tag Group */}
              <div className="flex-1 flex flex-col items-start lg:items-center min-w-0 pr-8 lg:pr-0">
                <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 lg:mt-5 leading-tight truncate w-full lg:text-center">{employee.name || 'Anonymous Employee'}</h3>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-400 mt-0.5 lg:mt-1 truncate w-full lg:text-center">
                  {currentDesignation} • <span className="text-teal-600 font-bold">{currentDepartment}</span>
                </p>

                <div className="flex gap-1.5 sm:gap-2 items-center mt-2 lg:mt-4">
                  <span className="bg-slate-100 text-slate-500 rounded-md font-mono text-[9px] sm:text-[10px] font-bold px-2 py-0.5 sm:px-2.5 sm:py-1">
                    {employee.id.startsWith('EMP_TEMP_') ? 'TEMP' : employee.id}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    Active
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Profile Parameters Table */}
            <div className="w-full border-t border-slate-100 mt-4 sm:mt-5 lg:mt-6 pt-4 sm:pt-5 flex flex-col gap-3 sm:gap-3.5 text-left text-xs text-slate-500">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Department</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{currentDepartment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Designation</span>
                <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{currentDesignation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Shift Time</span>
                <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{currentShiftTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Shift Mode</span>
                <span className={`font-bold px-2 py-0.5 rounded uppercase ${employee.shift === 'NIGHT' ? 'text-purple-700 bg-purple-50' : 'text-amber-700 bg-amber-50'}`}>
                  {(employee.shift || 'DAY')} SHIFT
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Sunday Pay</span>
                <span className={`font-bold px-2 py-0.5 rounded ${employee.sundayPaid === 'Paid' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                  {employee.sundayPaid || 'Not Paid'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Salary Basis</span>
                <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded uppercase">
                  {employee.salaryType === 'daily' ? 'Daily Wage' : 'Fixed'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Salary Rate</span>
                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                  ₹{employee.monthlySalary || 0}{employee.salaryType === 'daily' ? '/day' : '/mo'}
                </span>
              </div>
            </div>
          </div>

          {/* Personal Info Box Card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col relative">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight mb-5 flex items-center justify-between">
              <span>Personal Info</span>
              <button onClick={startProfileEdit} className="text-teal-600 hover:text-teal-700 cursor-pointer">
                <Edit2 size={13} />
              </button>
            </h4>

            <div className="space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 bg-sky-50 text-sky-600 rounded-lg flex items-center justify-center shrink-0">
                  <User size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gender</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{currentGender}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                  <Phone size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phone</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{currentPhone}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Address</p>
                  <p className="text-xs font-semibold text-slate-700 leading-normal mt-0.5">{currentAddress}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== MIDDLE COLUMN: BENTO BLOCKS (6/12 cols) ==================== */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          {/* Leaves Circular Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            {/* Statistic 1 - Monthly Absent Days */}
            <div className="bg-white border border-slate-150 p-4 rounded-3xl flex flex-col items-center relative shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Monthly Absent Days</span>
              {/* circular metric */}
              <div className="relative w-20 h-20 mt-3 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r="30" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                  <circle 
                    cx="40" cy="40" r="30" stroke="#f43f5e" strokeWidth="6" fill="transparent" 
                    strokeDasharray={`${2 * Math.PI * 30}`}
                    strokeDashoffset={`${2 * Math.PI * 30 * (1 - (absencesCount / daysInMonth))}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-sm font-black text-rose-600">{absencesCount}/{daysInMonth}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Days</span>
                </div>
              </div>
            </div>

            {/* Statistic 4 - Monthly Present Days */}
            <div className="bg-white border border-slate-150 p-4 rounded-3xl flex flex-col items-center relative shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Monthly Present Days</span>
              <div className="relative w-20 h-20 mt-3 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r="30" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                  <circle 
                    cx="40" cy="40" r="30" stroke="#10b981" strokeWidth="6" fill="transparent" 
                    strokeDasharray={`${2 * Math.PI * 30}`}
                    strokeDashoffset={`${2 * Math.PI * 30 * (1 - (elapsedDays > 0 ? presentDaysCount / elapsedDays : 0))}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-sm font-black text-emerald-600">{presentDaysCount}/{elapsedDays}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Days</span>
                </div>
              </div>
            </div>

            {/* Statistic 2 - Daily In-Out Logs */}
            <div className="bg-white border border-slate-150 p-4 rounded-3xl flex flex-col items-center relative shadow-sm hover:shadow-md transition-shadow col-span-2 w-full min-h-[148px]">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Daily In-Out Logs</span>
              
              {punchesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center text-slate-400 mt-2 select-none">
                  <Clock size={16} className="text-slate-350 mb-1" />
                  <p className="text-[10px] font-semibold leading-tight font-sans">No Logs Selected</p>
                  <p className="text-[8px] mt-0.5">{selectedDay} {monthNames[calendarMonth]}</p>
                </div>
              ) : (
                <div className="w-full mt-2.5 grid grid-cols-2 gap-1.5">
                   {punchesList.map((punch, idx) => {
                     const parts = punch.split(' ');
                     const time = parts[0] || '08:00';
                     const isIN = punch.toUpperCase().includes('IN') || punch.toUpperCase().includes('ARR');
                     const isAuto = punch.toUpperCase().includes('(AUTO)');
                     return (
                       <div key={idx} className={`flex justify-between items-center p-1.5 px-2 rounded-xl border transition-all ${
                         isAuto 
                           ? 'bg-amber-100 text-amber-955 border-amber-500 border-2 ring-1 ring-amber-400/50 shadow-xs animate-pulse' 
                           : 'bg-slate-50 border-slate-100'
                       }`} title={isAuto ? "Automatically repaired and inserted by the attendance engine" : undefined}>
                         <span className={`text-[10px] font-mono font-bold ${isAuto ? 'text-amber-950 font-extrabold' : 'text-slate-700'}`}>{time}</span>
                         <div className="flex items-center gap-1.5">
                           <span className={`text-[8px] uppercase font-extrabold px-1.5 py-0.2 rounded-md ${
                             isAuto
                                ? isIN ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                : isIN ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                           }`}>
                             {employee.shift === 'NIGHT' ? (isIN ? 'Arr Time' : 'Out 1') : (isIN ? 'In' : 'Out')}
                           </span>
                           {isAuto && (
                             <span className="bg-amber-600 text-white text-[7.5px] font-black px-1 rounded-sm uppercase tracking-wider font-mono">
                               Auto
                             </span>
                           )}
                         </div>
                       </div>
                     );
                   })}
                </div>
              )}
            </div>

          </div>

          {/* 📊 Salary & Deductions Breakdown Card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col gap-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5 uppercase">
                  📊 Salary & Deductions Breakdown
                </h4>
                <p className="text-xs text-slate-400 font-medium">Calculation Sheet for {monthNames[calendarMonth]} {calendarYear}</p>
              </div>
              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl text-slate-500 text-xs font-semibold select-none">
                <span className="bg-white px-2.5 py-1 rounded-lg text-emerald-600 border border-emerald-50 shadow-xs font-bold font-mono">
                  {formatINR(liveFinalPayable)} Net Pay
                </span>
              </div>
            </div>

            {/* Core Calculations Block */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Earnings & Rates (Left Column) */}
              <div className="space-y-4">
                <p className="text-[10px] font-extrabold text-[#16a085] uppercase tracking-wider select-none">Earnings & Base Rates</p>
                
                <div className="space-y-3 bg-slate-50/55 border border-slate-100 p-4 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-500">{isDailyBasis ? 'Daily Wage Rate' : 'Base Monthly Salary'}</span>
                    <span className="text-sm font-bold text-slate-800 font-mono">{formatINR(baseSalary)}</span>
                  </div>

                  {uploadedDaysInThisMonth.length > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5 bg-emerald-50/20 px-2 py-1 rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-emerald-800 block">Accrued Base Pay</span>
                        <span className="text-[10px] text-emerald-600 font-semibold">{uploadedDaysInThisMonth.length} Days Uploaded</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 font-mono">{formatINR(grossMonthlyBasis)}</span>
                    </div>
                  )}

                  {isDailyBasis && uploadedDaysInThisMonth.length === 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                      <span className="text-xs font-semibold text-slate-500">Gross Monthly Salary</span>
                      <span className="text-xs font-bold text-slate-805 font-mono">{formatINR(grossMonthlyBasis)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Working Days / Month</span>
                    <span className="text-xs font-bold text-slate-700 font-mono">{workingDays} Days</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Daily Earning Rate</span>
                    <span className="text-xs font-bold text-slate-700 font-mono" title={isDailyBasis ? "Daily rate fixed" : `${baseSalary} / ${workingDays}`}>{formatINR(dynamicDailyRate)} / day</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Hourly Earning Rate</span>
                    <span className="text-xs font-bold text-slate-700 font-mono" title={isDailyBasis ? `${baseSalary} / ${workingHoursPerDay}` : `(${baseSalary} / ${workingDays}) / ${workingHoursPerDay}`}>{formatINR(dynamicHourlyRate)} / hour</span>
                  </div>

                  {isFixed && employee.sundayPaid === 'Paid' && (
                    <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">Sunday Overtime (OT)</span>
                        <span className="text-[10px] text-emerald-600 font-bold ml-0">{liveSundayOTDays} Sunday OT Days Worked</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 font-mono" title={`${liveSundayOTDays} Sundays × ${formatINR(dynamicDailyRate)} / day`}>
                        + {formatINR(liveSundayOTAmount)}
                      </span>
                    </div>
                  )}

                  {calendarMonthlyOtAmount > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">Overtime (OT) Amount</span>
                        <span className="text-[10px] text-emerald-600 font-bold ml-0 block">{calendarMonthlyOtHours.toFixed(1)} Hours Worked</span>
                        <span className="text-[10px] text-emerald-600 font-bold ml-0 block">{calendarMonthlyOtLogs.length} Overtime Shifts Worked</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 font-mono" title={`Calculated proportionally: ${calendarMonthlyOtHours.toFixed(1)} hours worked relative to 12h shifts @ ${formatINR(dynamicDailyRate)} / full shift`}>
                        + {formatINR(calendarMonthlyOtAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Deductions & Infractions (Right Column) */}
              <div className="space-y-4">
                <p className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider select-none">Losses & Deductions</p>
                
                <div className="space-y-3 bg-rose-50/30 border border-rose-100/40 p-4 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 block">Full Day Absences</span>
                      <span className="text-[9px] text-rose-500 font-bold ml-0">{absencesCount} absent days</span>
                    </div>
                    <span className="text-xs font-bold text-rose-600 font-mono">- {formatINR(liveDeductionFullDay)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 font-sans">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 block">Short Hours & Lates</span>
                      <span className="text-[9px] text-rose-500 font-bold ml-0">{liveTotalAbsentHours.toFixed(2)} hours logged</span>
                    </div>
                    <span className="text-xs font-bold text-rose-600 font-mono">- {formatINR(liveDeductionHourly)}</span>
                  </div>

                  {liveDeductionPartialDay > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 font-sans">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">Partial Present Deductions</span>
                        <span className="text-[9px] text-rose-500 font-bold ml-0">
                          {partialDaysList.length} day(s) &lt; 8 hrs (worked {partialDaysList.reduce((acc, pd) => acc + (pd.minutes / 60), 0).toFixed(1)} hrs total)
                        </span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 font-mono">- {formatINR(liveDeductionPartialDay)}</span>
                    </div>
                  )}

                  {advance > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 font-sans">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">Advances Paid</span>
                        <span className="text-[9px] text-slate-450 font-bold ml-0">Registered Deduction</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 font-mono">- {formatINR(advance)}</span>
                    </div>
                  )}

                  {food > 0 && (
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 font-sans">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 block">Food Bill Balance</span>
                        <span className="text-[9px] text-slate-400 font-bold ml-0">Registered Deduction</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 font-mono">- {formatINR(food)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-rose-100 pt-2.5 font-bold">
                    <span className="text-xs text-slate-700">Total pay cuts</span>
                    <span className="text-sm text-rose-600 font-mono">{formatINR(liveTotalPayCuts)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Dynamic visual slider progress bar from Net Pay to Gross Base Salary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 mt-1">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-slate-500">Earned Salary Progress Indicator</span>
                <span className="text-emerald-600 font-mono">
                  {grossMonthlyBasis > 0 ? ((liveFinalPayable / grossMonthlyBasis) * 100).toFixed(1) : '100'}% Net Earning
                </span>
              </div>
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden relative shadow-inner">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${grossMonthlyBasis > 0 ? (liveFinalPayable / grossMonthlyBasis) * 100 : 100}%` }}
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-1">
                <Info size={10} className="text-slate-450" />
                Deductions are calculated exactly by daily rate and missed hour schedules.
              </p>
            </div>
          </div>

          {/* Row of (Hours Logged / Document checklist) split columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Overtime Logs Summary for the Selected Employee (Month-Year wise) */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between min-h-[300px]">
              <div>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Zap size={14} className="text-emerald-500 fill-emerald-500 animate-pulse" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Overtime Summary</h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select 
                      value={otFilterMonth}
                      onChange={(e) => setOtFilterMonth(parseInt(e.target.value, 10))}
                      className="bg-slate-50 text-[10px] font-extrabold text-slate-650 rounded-lg px-2 py-1 cursor-pointer focus:outline-hidden border border-slate-200/60"
                    >
                      {monthsList.map((m, idx) => (
                        <option key={idx} value={idx}>{m.substring(0, 3)}</option>
                      ))}
                    </select>
                    <select 
                      value={otFilterYear}
                      onChange={(e) => setOtFilterYear(parseInt(e.target.value, 10))}
                      className="bg-slate-50 text-[10px] font-extrabold text-slate-650 rounded-lg px-2 py-1 cursor-pointer focus:outline-hidden border border-slate-200/60"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Total Stats Header with calculated wages */}
                <div className="bg-emerald-50/20 border border-emerald-100 rounded-2xl p-4 grid grid-cols-2 gap-4 mb-4 shadow-3xs">
                  {/* Left Column: Total Hours */}
                  <div className="flex flex-col justify-between">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider leading-none">Total OT Hours</p>
                      <span className="text-xl font-black text-slate-800 tracking-tight block mt-2 leading-none">
                        {totalOtHours.toFixed(1)} hrs
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-slate-500 mt-2 bg-slate-550/5 border border-slate-200/40 rounded-lg px-2 py-1 w-max">
                      <Clock size={11} className="text-slate-400" />
                      @ {formatINR(otRates.dailyRate)}/shift (12 hrs)
                    </span>
                  </div>

                  {/* Right Column: Amount & Shifts */}
                  <div className="border-l border-slate-200/60 pl-4 flex flex-col justify-between items-end text-right">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider leading-none">OT Amount Payable</p>
                      <span className="text-xl font-black text-emerald-650 tracking-tight block mt-2 leading-none font-mono">
                        {formatINR(totalOtAmount)}
                      </span>
                    </div>
                    <span className="inline-flex items-center justify-center bg-emerald-100/50 text-emerald-800 font-extrabold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider mt-2">
                      {filteredOtLogs.length} shifts
                    </span>
                  </div>
                </div>

                {/* Log list */}
                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                  {filteredOtLogs.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock size={20} className="mx-auto text-slate-350 mb-2" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No OT Logs</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-bold">No overtime recorded for this month</p>
                    </div>
                  ) : (
                    filteredOtLogs.map((log) => {
                      const hw = calculateHoursWorked(log.arrTime, log.outTime);
                      const shiftAmount = (hw / 12) * otRates.dailyRate;
                      // Format date format for log e.g. "08 Jun"
                      let displayDate = log.date;
                      try {
                        const dObj = new Date(log.date);
                        if (!isNaN(dObj.getTime())) {
                          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          displayDate = `${dObj.getDate().toString().padStart(2, '0')} ${monthsList[dObj.getMonth()].substring(0, 3)} (${days[dObj.getDay()]})`;
                        }
                      } catch (e) {}

                      return (
                        <div key={log.id} className="bg-slate-50/40 border border-slate-100 rounded-xl p-2.5 hover:bg-slate-50 hover:shadow-xs transition-all">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-[10px] font-black text-slate-700 block font-mono">{displayDate}</span>
                              <span className="text-[9px] text-slate-455 block mt-0.5 leading-normal font-bold max-w-[190px]" title={log.shiftPattern}>
                                {log.shiftPattern}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-black text-emerald-650 block font-mono">{formatINR(shiftAmount)}</span>
                              <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{hw.toFixed(1)} hrs • {log.arrTime}-{log.outTime}</span>
                            </div>
                          </div>
                          {log.remarks && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[9px] text-slate-500 italic font-medium leading-relaxed">
                              "{log.remarks}"
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Advances Paid history logs */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between min-h-[300px]">
              <div>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Wallet size={14} className="text-emerald-500" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Advances Paid</h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select 
                      value={otFilterMonth}
                      onChange={(e) => setOtFilterMonth(parseInt(e.target.value, 10))}
                      className="bg-slate-50 text-[10px] font-extrabold text-slate-650 rounded-lg px-2 py-1 cursor-pointer focus:outline-hidden border border-slate-200/60"
                    >
                      {monthsList.map((m, idx) => (
                        <option key={idx} value={idx}>{m.substring(0, 3)}</option>
                      ))}
                    </select>
                    <select 
                      value={otFilterYear}
                      onChange={(e) => setOtFilterYear(parseInt(e.target.value, 10))}
                      className="bg-slate-50 text-[10px] font-extrabold text-slate-650 rounded-lg px-2 py-1 cursor-pointer focus:outline-hidden border border-slate-200/60"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* List items */}
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {filteredAdvanceHistory.length === 0 ? (
                    <div className="text-center py-10">
                      <Coins size={20} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest">No Advances Paid</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-semibold">No advance payouts logged for this employee in {monthsList[otFilterMonth]} {otFilterYear}</p>
                    </div>
                  ) : (
                    filteredAdvanceHistory.map((adv) => (
                      <div key={adv.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-all">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 shrink-0 border border-amber-100/50">
                            <Coins size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-amber-805 leading-tight font-mono">
                              {formatINR(adv.amount)}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold mt-0.5" title={adv.id}>
                              {adv.date || `Month Run: ${adv.id}`}
                            </p>
                          </div>
                        </div>
                        {adv.remarks && (
                          <div className="text-right max-w-[120px] truncate" title={adv.remarks}>
                            <span className="text-[9px] text-slate-400 italic bg-white border border-slate-100 px-1.5 py-0.5 rounded-md font-medium inline-block">
                              "{adv.remarks}"
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Internal Notes area */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight uppercase mb-4">Internal Notes</h4>
            
            {/* Notes List */}
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {notesList.map((note, idx) => {
                const isPromo = note.toLowerCase().includes('promotion');
                const isApprec = note.toLowerCase().includes('appreciation');
                
                return (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-2xl border ${isPromo ? 'bg-amber-50/40 border-amber-100 text-slate-700' : isApprec ? 'bg-emerald-50/40 border-emerald-100 text-slate-700' : 'bg-slate-50 border-slate-100 text-slate-700'}`}
                  >
                    <div className="flex justify-between items-start mb-1.5 select-text">
                      <span className={`text-[10px] uppercase font-mono font-black ${isPromo ? 'text-amber-700' : isApprec ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {isPromo ? 'Promotion Feedback' : isApprec ? 'Employee Appreciation' : 'Supervisor Memo'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed font-medium">{note}</p>
                  </div>
                );
              })}
            </div>

            {/* Quick Note attachment bar */}
            <form onSubmit={handleAddNote} className="mt-4 pt-4 border-t border-[#f1f5f9] flex gap-2">
              <input 
                type="text" 
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Type a new internal supervisor note or supervisor update alert..."
                className="bg-[#f8fafc] rounded-xl text-xs px-3.5 py-2.5 focus:bg-white focus:outline-hidden border border-slate-250 focus:ring-1 focus:ring-teal-500 flex-1 font-medium placeholder-slate-400"
              />
              <button 
                type="submit"
                className="bg-teal-500 hover:bg-teal-600 text-white rounded-xl px-4 text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus size={13} />
                <span>Add Memo</span>
              </button>
            </form>
          </div>

        </div>

        {/* ==================== RIGHT COLUMN: ATTENDANCE CALENDAR & PAYROLL SUMMARY (3/12 cols) ==================== */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Calendar Widget Card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5.5 select-none" id="mini-calendar-pouch">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance Map</h4>
                <p className="text-sm font-black text-slate-800 tracking-tight mt-0.5">
                  {monthNames[calendarMonth]} {calendarYear}
                </p>
              </div>
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-150">
                <button 
                  onClick={handlePrevMonth}
                  className="p-1 text-slate-500 hover:text-slate-800 transition-colors hover:bg-white rounded-md cursor-pointer"
                >
                  <ChevronLeft size={13} />
                </button>
                <button 
                  onClick={handleNextMonth}
                  className="p-1 text-slate-500 hover:text-slate-800 transition-colors hover:bg-white rounded-md cursor-pointer"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            {/* Weekdays Row header */}
            <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-mono font-black uppercase text-slate-400 mb-2">
              <span>S</span>
              <span>M</span>
              <span>T</span>
              <span>W</span>
              <span>T</span>
              <span>F</span>
              <span>S</span>
            </div>

            {/* Actual Days Grid mapping dynamic arrays */}
            <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center text-xs">
              {calendarDays.map((slot, index) => {
                const cellDateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(slot.day).padStart(2, '0')}`;
                const dayPunches = getAdjustedPunchesForDate(cellDateStr);
                const hasPunches = dayPunches.length > 0;
                const workMinutes = getWorkMinutes(dayPunches);

                const absent = isAbsentDay(slot.day, slot.isCurrentMonth);
                const isPartialPresent = hasPunches && (workMinutes < 480);
                const late = isLateDay(slot.day, slot.isCurrentMonth);
                const isSelected = slot.isCurrentMonth && slot.day === selectedDay;

                // Color priority: standard layout or custom punch logs loaded from file
                let cellClass = "text-slate-700 hover:bg-slate-50";
                if (!slot.isCurrentMonth) {
                  cellClass = "text-slate-300 pointer-events-none";
                } else if (absent) {
                  cellClass = "bg-rose-500 text-white shadow-xs shadow-rose-300 ring-4 ring-white hover:bg-rose-600";
                } else if (isPartialPresent) {
                  cellClass = "bg-amber-400 text-white shadow-xs shadow-amber-200 ring-4 ring-white hover:bg-amber-500";
                } else if (hasPunches) {
                  cellClass = "bg-emerald-500 text-white font-black shadow-xs shadow-emerald-200 hover:bg-emerald-600";
                } else if (late) {
                  cellClass = "bg-amber-400 text-white shadow-xs shadow-amber-200 ring-4 ring-white hover:bg-amber-500";
                } else {
                  cellClass = "bg-slate-50 text-slate-700 hover:bg-slate-100";
                }

                return (
                  <button 
                    key={index} 
                    type="button"
                    disabled={!slot.isCurrentMonth}
                    onClick={() => {
                      if (slot.isCurrentMonth) setSelectedDay(slot.day);
                    }}
                    className={`h-8 w-8 flex flex-col items-center justify-center font-bold text-[10px] rounded-lg mx-auto relative cursor-pointer group transition-all ${cellClass} ${
                      isSelected ? 'ring-2 ring-slate-800 ring-offset-1 scale-110 z-10' : ''
                    }`}
                  >
                    <span>{slot.day}</span>
                    {hasPunches && !absent && !isSelected && (
                      <span className="w-1 h-1 bg-white rounded-full absolute bottom-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Attendance Legends */}
            <div className="flex justify-between items-center border-t border-slate-100 pt-3.5 mt-3.5 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 block" /> Synced
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-400 block" /> Partial Present
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500 block" /> Absent
              </span>
            </div>
          </div>

          {/* ==================== DAILY BIOMETRIC PUNCH LOGS INTERACTIVE PANEL ==================== */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm space-y-4" id="daily-punch-logs">
            <div className="flex justify-between items-center select-none">
              <div className="flex items-center gap-1.5 text-teal-400 font-bold uppercase tracking-wider text-[9.5px]">
                <Clock size={12} className="animate-pulse" />
                <span>Log: {calendarYear}-{String(calendarMonth + 1).padStart(2, '0')}-{String(selectedDay).padStart(2, '0')}</span>
              </div>
              {(() => {
                const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                const punchesList = getAdjustedPunchesForDate(targetDate);
                return punchesList.length > 0 && (
                  <span className="bg-teal-500/20 text-teal-300 font-mono text-[9px] px-1.5 py-0.5 rounded font-black uppercase">
                    {punchesList.length} logs
                  </span>
                );
              })()}
            </div>

            {(() => {
              const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
              const punchesList = getAdjustedPunchesForDate(targetDate);
              
              if (punchesList.length === 0) {
                return (
                  <div className="text-center py-4 space-y-2 select-none text-slate-400">
                    <p className="text-[10px] font-medium leading-relaxed font-sans max-w-[190px] mx-auto">
                      No biometric transactions logged for this date. Run the 'WiFi Machine Sync' hub to upload rows or enter a manual punch.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                   {punchesList.map((punch, idx) => {
                     const parts = punch.split(' ');
                     const time = parts[0] || '08:00';
                     const isIN = punch.toUpperCase().includes('IN') || punch.toUpperCase().includes('ARR');
                     const isAuto = punch.toUpperCase().includes('(AUTO)');
                     return (
                       <div key={idx} className={`flex justify-between items-center p-2 rounded-xl transition-all border ${
                         isAuto 
                           ? 'bg-amber-950/40 border-amber-500/50 text-amber-100 hover:bg-amber-900/40 animate-pulse' 
                           : 'bg-slate-805/80 bg-slate-800 hover:bg-slate-755 border-slate-850 border-slate-700/30'
                       }`} title={isAuto ? "Automatically repaired and inserted by the attendance engine" : undefined}>
                         <div className="flex items-center gap-2">
                           <span className={`w-1.5 h-1.5 rounded-full ${isAuto ? 'bg-amber-400 animate-ping' : isIN ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                           <span className="text-[11px] font-mono font-bold tracking-tight">{time}</span>
                           <span className={`text-[9.5px] uppercase font-black tracking-widest ${isAuto ? 'text-amber-400 font-extrabold' : isIN ? 'text-emerald-400' : 'text-rose-400'}`}>
                             {isAuto ? 'Auto-Repair' : isIN ? 'Check-In' : 'Check-Out'}
                           </span>
                         </div>
                        <button 
                          type="button" 
                          onClick={async () => {
                            const punchToDelete = punchesList[idx];
                            const isOutPunch = punchToDelete.toUpperCase().includes('OUT') || punchToDelete.toUpperCase().includes('DEP') || punchToDelete.toUpperCase().includes('EXIT');
                            
                            let pDate = targetDate;
                            if (employee.shift === 'NIGHT' && isOutPunch) {
                              const dateObj = new Date(targetDate);
                              dateObj.setUTCDate(dateObj.getUTCDate() + 1);
                              pDate = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
                            }
                            
                            const rawPunches = punchLogs[pDate]?.punches || [];
                            const filtered = rawPunches.filter(p => p !== punchToDelete);
                            const docRef = doc(db, 'employees', employee.id, 'punches', pDate);
                            try {
                              if (filtered.length === 0) {
                                await deleteDoc(docRef);
                              } else {
                                await setDoc(docRef, {
                                  id: pDate,
                                  employeeId: employee.id,
                                  date: pDate,
                                  punches: filtered
                                });
                              }
                              triggerAlert?.('success', 'Punch log updated successfully.');
                            } catch (error) {
                              handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}/punches/${pDate}`);
                              triggerAlert?.('warn', 'Offline mode: Changes saved in local Cache (Network fallback active).');
                            }

                            // Update local state immediately (offline-first execution)
                            setPunchLogs(prev => {
                              const next = { ...prev };
                              if (filtered.length === 0) {
                                delete next[pDate];
                              } else {
                                next[pDate] = {
                                  id: pDate,
                                  employeeId: employee.id,
                                  date: pDate,
                                  punches: filtered
                                };
                              }
                              return next;
                            });

                            // Update parent state real-time
                            if (setAllPunchLogs) {
                              setAllPunchLogs(prev => {
                                const next = { ...prev };
                                if (!next[employee.id]) {
                                  next[employee.id] = {};
                                }
                                if (filtered.length === 0) {
                                  delete next[employee.id][pDate];
                                } else {
                                  next[employee.id][pDate] = filtered;
                                }
                                localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
                                return next;
                              });
                            }
                          }}
                          className="hover:text-rose-500 text-slate-500 p-1 cursor-pointer rounded hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Manual Punch adding box */}
            <div className="border-t border-slate-800/80 pt-3 flex gap-2">
              <input 
                type="time" 
                id="manual-profile-punch-time"
                step="60"
                defaultValue="08:00"
                className="bg-slate-800 border border-slate-750 border-slate-700 rounded-xl px-2 py-1 text-xs text-white max-w-[85px] focus:outline-hidden"
              />
              <div className="flex gap-1.5 flex-1 select-none">
                <button
                  type="button"
                  onClick={async () => {
                    const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                    const currentPunches = punchLogs[targetDate]?.punches || [];
                    const timeInput = document.getElementById('manual-profile-punch-time') as HTMLInputElement | null;
                    const val = timeInput?.value || '08:00';
                    const newLog = `${val} IN`;
                    const updated = [...currentPunches, newLog].sort((a,b) => a.localeCompare(b));
                    const docRef = doc(db, 'employees', employee.id, 'punches', targetDate);
                    try {
                      await setDoc(docRef, {
                        id: targetDate,
                        employeeId: employee.id,
                        date: targetDate,
                        punches: updated
                      });
                      triggerAlert?.('success', 'Biometric punch log registered in Cloud Database.');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}/punches/${targetDate}`);
                      triggerAlert?.('warn', 'Offline mode: Registered punch saved in local Cache (Network fallback active).');
                    }
                    
                    // Update local state immediately (offline-first execution)
                    setPunchLogs(prev => {
                      const next = { ...prev };
                      next[targetDate] = {
                        id: targetDate,
                        employeeId: employee.id,
                        date: targetDate,
                        punches: updated
                      };
                      return next;
                    });

                    // Update parent state real-time
                    if (setAllPunchLogs) {
                      setAllPunchLogs(prev => {
                        const next = { ...prev };
                        if (!next[employee.id]) {
                          next[employee.id] = {};
                        }
                        next[employee.id] = {
                          ...next[employee.id],
                          [targetDate]: updated
                        };
                        localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
                        return next;
                      });
                    }
                  }}
                  className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9.5px] font-black uppercase transition-colors cursor-pointer text-center"
                >
                  + IN
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                    
                    let pDate = targetDate;
                    if (employee.shift === 'NIGHT') {
                      const dateObj = new Date(targetDate);
                      dateObj.setUTCDate(dateObj.getUTCDate() + 1);
                      pDate = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
                    }

                    const currentPunches = punchLogs[pDate]?.punches || [];
                    const timeInput = document.getElementById('manual-profile-punch-time') as HTMLInputElement | null;
                    const val = timeInput?.value || '17:00';
                    const newLog = `${val} OUT`;
                    const updated = [...currentPunches, newLog].sort((a,b) => a.localeCompare(b));
                    const docRef = doc(db, 'employees', employee.id, 'punches', pDate);
                    try {
                      await setDoc(docRef, {
                        id: pDate,
                        employeeId: employee.id,
                        date: pDate,
                        punches: updated
                      });
                      triggerAlert?.('success', 'Biometric punch log registered in Cloud Database.');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}/punches/${pDate}`);
                      triggerAlert?.('warn', 'Offline mode: Registered punch saved in local Cache (Network fallback active).');
                    }

                    // Update local state immediately (offline-first execution)
                    setPunchLogs(prev => {
                      const next = { ...prev };
                      next[pDate] = {
                        id: pDate,
                        employeeId: employee.id,
                        date: pDate,
                        punches: updated
                      };
                      return next;
                    });

                    // Update parent state real-time
                    if (setAllPunchLogs) {
                      setAllPunchLogs(prev => {
                        const next = { ...prev };
                        if (!next[employee.id]) {
                          next[employee.id] = {};
                        }
                        next[employee.id] = {
                          ...next[employee.id],
                          [pDate]: updated
                        };
                        localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
                        return next;
                      });
                    }
                  }}
                  className="flex-1 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-[9.5px] font-black uppercase transition-colors cursor-pointer text-center"
                >
                  + OUT
                </button>
              </div>
            </div>
          </div>

          {/* ==================== GATE PASS SUMMARY CARD ==================== */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4" id="employee-profile-gate-passes-panel">
            <div className="flex justify-between items-center border-b border-rose-100/50 pb-3">
              <div>
                <h4 className="text-[10.5px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Timer size={13} className="text-amber-500 animate-pulse" />
                  Gate Pass Summary
                </h4>
                <p className="text-[11px] text-slate-800 font-extrabold mt-0.5">
                  {monthNames[calendarMonth]} {calendarYear}
                </p>
              </div>
              <span className="bg-amber-50 text-amber-850 border border-amber-100 font-mono text-[9px] px-2 py-0.5 rounded-lg font-black uppercase flex items-center gap-1">
                {totalGatePassCount} PASS{totalGatePassCount === 1 ? '' : 'ES'}
              </span>
            </div>

            <div className="bg-[#fcfdfd] border border-slate-150/70 p-3.5 rounded-2xl flex flex-col gap-1 text-center shadow-xs">
              <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider">Accumulated Hours & Minutes</span>
              <span className="text-xl font-black text-slate-800 font-mono mt-0.5">
                {totalGateHoursAndMinsString}
              </span>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                Auto-synced from gate pass records
              </p>
            </div>

            {/* List details of active passes for current month if any */}
            {monthlyGatePasses.length > 0 ? (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest select-none pb-1 border-b border-slate-50">Details</p>
                {monthlyGatePasses.map((gp, idx) => {
                  const outFormatted = gp.outTime;
                  const inFormatted = gp.inTime;
                  const durMin = getGatePassMinutesWithShift(gp, employee.shiftTime);
                  const durH = Math.floor(durMin / 60);
                  const durM = durMin % 60;
                  const durationStr = durMin > 0 ? `${durH > 0 ? `${durH}h ` : ''}${durM}m` : '0m';
                  
                  // Convert YYYY-MM-DD to DD-MMM
                  let dateLabel = gp.date;
                  try {
                    const dParts = gp.date.split('-');
                    if (dParts.length === 3) {
                      const dayNum = parseInt(dParts[2], 10);
                      const monthIdx = parseInt(dParts[1], 10) - 1;
                      dateLabel = `${dayNum} ${monthNames[monthIdx].substring(0,3)}`;
                    }
                  } catch {}

                  return (
                    <div key={gp.id || idx} className="bg-slate-50/70 hover:bg-slate-50 border border-slate-100 rounded-xl p-2 flex justify-between items-center text-xs transition-colors">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-slate-800 text-[10.5px]">{dateLabel}</span>
                          <span className="text-slate-300">|</span>
                          <span className="font-semibold text-slate-500 font-mono text-[9px]">{outFormatted} - {inFormatted}</span>
                        </div>
                        {gp.remarks && (
                          <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wide italic mt-1 leading-normal whitespace-normal break-words select-text">
                            "{gp.remarks}"
                          </p>
                        )}
                      </div>
                      <span className="bg-amber-100/60 text-amber-950 font-mono font-black rounded-md px-1.5 py-0.5 text-[9.5px] shrink-0">
                        +{durationStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border border-dashed border-slate-150 rounded-2xl p-4 text-center mt-1 select-none">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  No gate passes recorded
                </p>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ==================== MODAL: PROFILE DETAILS EDITOR ==================== */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Edit2 size={14} className="text-teal-500" />
                <span>Edit Profile Information</span>
              </h3>
              <button 
                onClick={() => setIsEditingProfile(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
              <div className="col-span-2">
                <label className="block mb-1 text-slate-400">Full Name</label>
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 font-bold text-slate-800 uppercase"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Corporate Role</label>
                <input 
                  type="text" 
                  value={editedRole} 
                  onChange={(e) => setEditedRole(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Department</label>
                <input 
                  type="text" 
                  value={editedDepartment} 
                  onChange={(e) => setEditedDepartment(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Designation</label>
                <input 
                  type="text" 
                  value={editedDesignation} 
                  onChange={(e) => setEditedDesignation(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Phone</label>
                <input 
                  type="text" 
                  value={editedPhone} 
                  onChange={(e) => setEditedPhone(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Shift Time</label>
                <input 
                  type="text" 
                  value={editedShiftTime} 
                  onChange={(e) => setEditedShiftTime(e.target.value)}
                  placeholder="e.g. 08:00 - 17:00"
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Shift Mode</label>
                <select 
                  value={editedShift} 
                  onChange={(e) => setEditedShift(e.target.value as 'DAY' | 'NIGHT')}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="DAY">DAY SHIFT</option>
                  <option value="NIGHT">NIGHT SHIFT</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Gender</label>
                <select 
                  value={editedGender} 
                  onChange={(e) => setEditedGender(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block mb-1 text-slate-400">Address Location</label>
                <input 
                  type="text" 
                  value={editedAddress} 
                  onChange={(e) => setEditedAddress(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Salary Amount (Monthly or Daily Wage)</label>
                <input 
                  type="number" 
                  value={editedMonthlySalary} 
                  onChange={(e) => setEditedMonthlySalary(Number(e.target.value))}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Salary Basis (Daily or Fixed)</label>
                <select 
                  value={editedSalaryType} 
                  onChange={(e) => setEditedSalaryType(e.target.value as 'fixed' | 'daily')}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="fixed">Fixed (Monthly)</option>
                  <option value="daily">Daily Wage (Per-Day Rate)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Sunday Paid Status</label>
                <select 
                  value={editedSundayPaid} 
                  onChange={(e) => setEditedSundayPaid(e.target.value as 'Paid' | 'Not Paid')}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="Paid">Sunday PAID</option>
                  <option value="Not Paid">Sunday NOT Paid</option>
                </select>
              </div>

            </div>

            <div className="flex gap-3 justify-end mt-4 pt-3 border-t border-slate-100 select-none">
              <button 
                onClick={() => setIsEditingProfile(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveProfile}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-bold font-semibold flex items-center gap-1 cursor-pointer text-xs"
              >
                <Check size={13} />
                <span>Save Changes</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Small helper counts total absences to write formatted feedback
function spacesCountText(emp: ComputedEmployee) {
  let text = '';
  if (emp.fullDaysAbsent > 0) text += `${emp.fullDaysAbsent}d`;
  const hrs = emp.absentHours + (emp.absentMinutes / 60);
  if (hrs > 0) text += `${text ? ' + ' : ''}${hrs.toFixed(1)}h`;
  return text || 'No absences';
}
