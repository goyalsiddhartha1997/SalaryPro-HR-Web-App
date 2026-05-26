/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { ComputedEmployee, Employee } from '../types';
import { collection, onSnapshot, doc, setDoc, deleteDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase';
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
  Info
} from 'lucide-react';

interface EmployeeProfileDetailsProps {
  employee: ComputedEmployee;
  allEmployees: ComputedEmployee[];
  onBack: () => void;
  onUpdateEmployee: (id: string, updatedFields: Partial<Employee>) => void;
  onSelectEmployeeId: (id: string) => void;
}

export default function EmployeeProfileDetails({
  employee,
  allEmployees,
  onBack,
  onUpdateEmployee,
  onSelectEmployeeId
}: EmployeeProfileDetailsProps) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedRole, setEditedRole] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAddress, setEditedAddress] = useState('');
  const [editedDob, setEditedDob] = useState('');
  const [editedJoinDate, setEditedJoinDate] = useState('');
  const [editedWorkModel, setEditedWorkModel] = useState('Hybrid');
  const [editedGender, setEditedGender] = useState('Female');
  const [editedEmploymentType, setEditedEmploymentType] = useState('Full-Time');

  // Interactive local states for Notes & Documents
  const [newNote, setNewNote] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocSize, setNewDocSize] = useState('1.5 MB');

  // Calendar Year & Month state (May 2026!)
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(4); // May is index 4
  const [selectedDay, setSelectedDay] = useState<number>(25); // Default to today: 25th

  // Subcollection real-time punches log state
  const [punchLogs, setPunchLogs] = useState<Record<string, { id: string; employeeId: string; date: string; punches: string[] }>>({});

  // Real-time tracking of all uploaded logs in entire application to find unique dates dynamically
  const [allUploadedDates, setAllUploadedDates] = useState<string[]>([]);

  useEffect(() => {
    if (!employee.id) return;
    const unsubscribe = onSnapshot(collection(db, 'employees', employee.id, 'punches'), (snapshot: any) => {
      const records: Record<string, any> = {};
      snapshot.forEach((docSnap: any) => {
        records[docSnap.id] = docSnap.data();
      });
      setPunchLogs(records);
    }, (err: any) => {
      console.error("Biometric logs stream interrupted:", err);
    });
    return () => unsubscribe();
  }, [employee.id]);

  useEffect(() => {
    try {
      const q = collectionGroup(db, 'punches');
      const unsubscribe = onSnapshot(q, (snapshot: any) => {
        const datesSet = new Set<string>();
        snapshot.forEach((docSnap: any) => {
          if (docSnap.id && docSnap.id.includes('-')) {
            datesSet.add(docSnap.id);
          }
        });
        setAllUploadedDates(Array.from(datesSet));
      }, (err: any) => {
        console.error("All punches collection group stream error:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Failed to setup punches collectionGroup listener:", e);
    }
  }, []);

  const startProfileEdit = () => {
    setEditedName(employee.name || 'Employee Name');
    setEditedRole(employee.role || 'HR Officer - Human Resources');
    setEditedEmail(employee.email || 'mia.torres@company.com');
    setEditedPhone(employee.phone || '+62 812-3456-7890');
    setEditedAddress(employee.address || 'Jl. Melati No. 45, Sleman, Yogyakarta, Indonesia');
    setEditedDob(employee.dob || '28 March 1993');
    setEditedJoinDate(employee.joinDate || '14 February 2033');
    setEditedWorkModel(employee.workModel || 'Hybrid');
    setEditedGender(employee.gender || 'Female');
    setEditedEmploymentType(employee.employmentType || 'Full-Time');
    setIsEditingProfile(true);
  };

  const handleSaveProfile = () => {
    onUpdateEmployee(employee.id, {
      name: editedName,
      role: editedRole,
      email: editedEmail,
      phone: editedPhone,
      address: editedAddress,
      dob: editedDob,
      joinDate: editedJoinDate,
      workModel: editedWorkModel,
      gender: editedGender,
      employmentType: editedEmploymentType
    });
    setIsEditingProfile(false);
  };

  // Safe Fallback defaults
  const currentRole = employee.role || 'HR Officer - Human Resources';
  const currentEmail = employee.email || `${(employee.name || 'user').toLowerCase().replace(/\s+/g, '.')}@company.com`;
  const currentPhone = employee.phone || '+62 812-3456-7890';
  const currentAddress = employee.address || 'Jl. Melati No. 45, Sleman, Yogyakarta, Indonesia';
  const currentDob = employee.dob || '28 March 1993';
  const currentJoinDate = employee.joinDate || '14 February 2033';
  const currentWorkModel = employee.workModel || 'Hybrid';
  const currentGender = employee.gender || 'Female';
  const currentEmploymentType = employee.employmentType || 'Full-Time';

  const documentsList = employee.documents || [
    { name: 'Performance Evaluation.pdf', size: '1.24 MB', date: '10 Jan 2035' },
    { name: 'Contract Agreement.pdf', size: '895 KB', date: '14 Feb 2033' },
    { name: 'Curriculum Vitae.pdf', size: '1.27 MB', date: '05 Jan 2033' },
    { name: 'Portfolio.pdf', size: '3.68 MB', date: '08 Jan 2033' }
  ];

  const notesList = employee.notes || [
    'Promotion Feedback: Promoted from HR Assistant to HR Officer due to consistent performance and leadership in onboarding initiatives. (10 January 2035)',
    'Employee Appreciation: Recognized by the Head of HR for successfully leading the Q2 training rollout with a 98% participation rate. (02 May 2035)'
  ];

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
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

  // Live dynamic absences count! Filter uploaded dates for current month/year and check if this employee has no punches
  const currentMonthStr = String(calendarMonth + 1).padStart(2, '0');
  const monthPrefix = `${calendarYear}-${currentMonthStr}-`;
  
  const uploadedDaysInThisMonth = allUploadedDates.filter(d => d.startsWith(monthPrefix));
  
  const uploadedAbsencesCount = uploadedDaysInThisMonth.filter(d => {
    const dayPunchesRaw = punchLogs[d]?.punches || [];
    const dayPunches = dayPunchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
    return dayPunches.length === 0;
  }).length;

  const absencesCount = uploadedDaysInThisMonth.length > 0 ? uploadedAbsencesCount : (employee.fullDaysAbsent || 0);

  // Circular stats dynamic progress
  const leavesTaken = Math.min(20, Math.round(14 - absencesCount));
  const leavesMax = 20;

  // Let's perform precise live salary and deduction calculations based on actual live monthly absences for the new Salary & Deductions Breakdown Card
  const workingDays = employee.workingDays || 26;
  const workingHoursPerDay = employee.workingHours || 8;
  const dynamicDailyRate = baseSalary > 0 && workingDays > 0 ? baseSalary / workingDays : 0;
  const dynamicHourlyRate = dynamicDailyRate > 0 && workingHoursPerDay > 0 ? dynamicDailyRate / workingHoursPerDay : 0;
  
  const liveDeductionFullDay = dynamicDailyRate * absencesCount;
  const liveTotalAbsentHours = (employee.absentHours || 0) + ((employee.absentMinutes || 0) / 60);
  const liveDeductionHourly = dynamicHourlyRate * liveTotalAbsentHours;
  
  const liveTotalDeduction = liveDeductionFullDay + liveDeductionHourly;
  const liveFinalPayable = Math.max(0, baseSalary - liveTotalDeduction);

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
  const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const punchesListRaw = punchLogs[targetDate]?.punches || [];
  const punchesList = punchesListRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
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
    const cellDateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    
    // 1. If this month features ANY uploaded biometric logs, rely strictly and exclusively on those logs
    if (uploadedDaysInThisMonth.length > 0) {
      if (allUploadedDates.includes(cellDateStr)) {
        const dayPunchesRaw = punchLogs[cellDateStr]?.punches || [];
        const dayPunches = dayPunchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
        return dayPunches.length === 0;
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
      if (allUploadedDates.includes(cellDateStr)) {
        const dayPunchesRaw = punchLogs[cellDateStr]?.punches || [];
        const dayPunches = dayPunchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
        // An odd number of logs or incomplete punches can visually count as special lates/exceptions
        return dayPunches.length > 0 && dayPunches.length % 2 !== 0;
      }
      return false;
    }

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

        {/* Quick Employee Selector dropdown for fluid navigation */}
        <div className="flex items-center gap-3 w-full md:w-auto self-stretch md:self-auto">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap hidden sm:block">Select Staff Profile:</label>
          <select 
            value={employee.id}
            onChange={(e) => onSelectEmployeeId(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden min-w-[200px]"
          >
            {allEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.id.startsWith('EMP_TEMP_') ? '(Empty Row Template)' : `${emp.id} - ${emp.name || 'Anonymous'}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 🍱 Core Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ==================== LEFT COLUMN: PERSONAL PROFILE (3/12 cols) ==================== */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Profile Card Summary */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center relative overflow-hidden group">
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={startProfileEdit}
                className="p-1 px-2.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-teal-50 hover:text-teal-600 border border-slate-100 transition-all font-semibold text-xs cursor-pointer flex items-center gap-1"
                title="Edit Employee Information"
              >
                <Edit2 size={12} />
                <span>Edit</span>
              </button>
            </div>

            {/* Mint Green Avatar Square Box (Exactly like screenshot) */}
            <div className="w-28 h-28 bg-[#1abc9c]/25 rounded-3xl flex items-center justify-center text-[#16a085] text-4xl font-black mt-4 shadow-inner relative group-hover:scale-105 transition-transform">
              {employee.name ? employee.name.charAt(0) : '?'}
              <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-4 border-white" title="Active Workforce status"></span>
            </div>

            <h3 className="text-lg font-bold text-slate-800 mt-5 leading-tight">{employee.name || 'Anonymous Employee'}</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1">{currentRole}</p>

            <div className="flex gap-2 items-center mt-4">
              <span className="bg-slate-100 text-slate-500 rounded-md font-mono text-[10px] font-bold px-2.5 py-1">
                {employee.id.startsWith('EMP_TEMP_') ? 'TEMP' : employee.id}
              </span>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                Active
              </span>
            </div>

            {/* Quick Profile Parameters Table */}
            <div className="w-full border-t border-slate-100 mt-6 pt-5 flex flex-col gap-3.5 text-left text-xs text-slate-500">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Employment Type</span>
                <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{currentEmploymentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Work Model</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{currentWorkModel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Join Date</span>
                <span className="font-bold text-slate-800">{currentJoinDate}</span>
              </div>
            </div>

            {/* Social Media icons */}
            <div className="flex gap-2.5 mt-6 border-t border-slate-100 pt-5 w-full justify-center">
              <a href="#" className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-blue-700 transition-all">
                <Linkedin size={13} />
              </a>
              <a href="#" className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-black transition-all">
                <Twitter size={13} />
              </a>
              <a href="#" className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-rose-600 transition-all">
                <Instagram size={13} />
              </a>
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
                <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center shrink-0">
                  <Calendar size={14} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Date of Birth</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{currentDob}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                  <Mail size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email Address</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate" title={currentEmail}>{currentEmail}</p>
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
            
            {/* Statistic 1 - Monthly Absences */}
            <div className="bg-white border border-slate-150 p-4 rounded-3xl flex flex-col items-center relative shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Monthly Absences</span>
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
                    return (
                      <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-1.5 px-2 rounded-xl">
                        <span className="text-[10px] font-mono font-bold text-slate-700">{time}</span>
                        <span className={`text-[8px] uppercase font-extrabold px-1.5 py-0.2 rounded-md ${
                          isIN ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {isIN ? 'In' : 'Out'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Statistic 4 - Sick Leaves */}
            <div className="bg-white border border-slate-150 p-4 rounded-3xl flex flex-col items-center relative shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Sick Leaves</span>
              <div className="relative w-20 h-20 mt-3 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="40" cy="40" r="30" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                  <circle 
                    cx="40" cy="40" r="30" stroke="#27ae60" strokeWidth="6" fill="transparent" 
                    strokeDasharray={`${2 * Math.PI * 30}`}
                    strokeDashoffset={`${2 * Math.PI * 30 * (1 - 0.75)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-sm font-black text-slate-800">3/4</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Days</span>
                </div>
              </div>
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
                    <span className="text-xs font-semibold text-slate-500">Base Monthly Salary</span>
                    <span className="text-sm font-bold text-slate-800 font-mono">{formatINR(baseSalary)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Working Days / Month</span>
                    <span className="text-xs font-bold text-slate-700 font-mono">{workingDays} Days</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Daily Earning Rate</span>
                    <span className="text-xs font-bold text-slate-700 font-mono" title={`${baseSalary} / ${workingDays}`}>{formatINR(dynamicDailyRate)} / day</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-100/70 pt-2.5">
                    <span className="text-xs font-semibold text-slate-500">Hourly Earning Rate</span>
                    <span className="text-xs font-bold text-slate-700 font-mono" title={`(${baseSalary} / ${workingDays}) / ${workingHoursPerDay}`}>{formatINR(dynamicHourlyRate)} / hour</span>
                  </div>
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

                  <div className="flex justify-between items-center border-t border-rose-100 pt-2.5 font-bold">
                    <span className="text-xs text-slate-700">Total pay cuts</span>
                    <span className="text-sm text-rose-600 font-mono">{formatINR(liveTotalDeduction)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Dynamic visual slider progress bar from Net Pay to Gross Base Salary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 mt-1">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-slate-500">Earned Salary Progress Indicator</span>
                <span className="text-emerald-600 font-mono">
                  {baseSalary > 0 ? ((liveFinalPayable / baseSalary) * 100).toFixed(1) : '100'}% Net Earning
                </span>
              </div>
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden relative shadow-inner">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${baseSalary > 0 ? (liveFinalPayable / baseSalary) * 100 : 100}%` }}
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
            
            {/* Hours Logged Component */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Hours Logged</h4>
                <select className="bg-slate-50 text-[10px] font-bold text-slate-500 rounded px-1.5 py-0.5 cursor-pointer uppercase focus:outline-hidden">
                  <option>This Week</option>
                  <option>Last Week</option>
                </select>
              </div>

              {/* Total Hours Header */}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-800 tracking-tight">
                    {Math.round((employee.workingDays - absencesCount) * employee.workingHours - employee.absentHours)}h
                  </span>
                  <span className="text-sm font-extrabold text-[#16a085]">30m</span>
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Calculated actual logged cycle</p>
              </div>

              {/* Daily Bar Chart columns representing working days */}
              <div className="flex justify-between items-end h-[100px] mt-6 px-1 select-none">
                {/* Mon */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-emerald-500 rounded-lg group-hover:bg-emerald-600 transition-colors" style={{ height: '70px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">M</span>
                </div>
                {/* Tue */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-emerald-500 rounded-lg group-hover:bg-emerald-600 transition-colors" style={{ height: absencesCount > 1 ? '0px' : '75px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">T</span>
                </div>
                {/* Wed */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-slate-200 rounded-lg group-hover:bg-teal-300 transition-colors" style={{ height: '35px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">W</span>
                </div>
                {/* Thu */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-[#1abc9c] rounded-lg group-hover:bg-[#16a085] transition-colors" style={{ height: '80px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">T</span>
                </div>
                {/* Fri */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-[#1abc9c] rounded-lg group-hover:bg-[#16a085] transition-colors" style={{ height: '65px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">F</span>
                </div>
                {/* Sat */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-slate-100 rounded-lg" style={{ height: '15px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">S</span>
                </div>
                {/* Sun */}
                <div className="flex flex-col items-center w-6 group relative">
                  <div className="w-2.5 bg-slate-100 rounded-lg" style={{ height: '0px' }} />
                  <span className="text-[9px] font-bold text-slate-400 mt-2 font-mono">S</span>
                </div>
              </div>
            </div>

            {/* Documents checklist with interactive mock addition */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Documents</h4>
                  <span className="text-[10px] font-bold text-[#16a085] bg-teal-50 px-2 py-0.5 rounded">PDF Standard</span>
                </div>

                {/* List items */}
                <div className="space-y-2.5 max-h-[140px] overflow-y-auto pr-1">
                  {documentsList.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 bg-rose-50 rounded-lg flex items-center justify-center text-rose-500 shrink-0">
                          <FileText size={13} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate leading-tight" title={doc.name}>
                            {doc.name}
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">PDF • {doc.size}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteDocument(idx)}
                        className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                        title="Delete Document"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload document inline helper Form */}
              <form onSubmit={handleAddDocument} className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                <input 
                  type="text" 
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="New file (e.g. Resume)"
                  className="bg-slate-50 rounded-lg text-[10px] px-2.5 py-1.5 focus:bg-white focus:outline-hidden border-0 focus:ring-1 focus:ring-teal-500 flex-1"
                />
                <button 
                  type="submit"
                  className="bg-emerald-500 text-white hover:bg-emerald-600 p-1.5 rounded-lg flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                  title="Attach mock file"
                >
                  <Plus size={13} />
                </button>
              </form>

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
                const dayPunchesRaw = punchLogs[cellDateStr]?.punches || [];
                const dayPunches = dayPunchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                const hasPunches = dayPunches.length > 0;

                const absent = isAbsentDay(slot.day, slot.isCurrentMonth);
                const late = isLateDay(slot.day, slot.isCurrentMonth);
                const isSelected = slot.isCurrentMonth && slot.day === selectedDay;

                // Color priority: standard layout or custom punch logs loaded from file
                let cellClass = "text-slate-700 hover:bg-slate-50";
                if (!slot.isCurrentMonth) {
                  cellClass = "text-slate-300 pointer-events-none";
                } else if (hasPunches) {
                  cellClass = "bg-emerald-500 text-white font-black shadow-xs shadow-emerald-200 hover:bg-emerald-600";
                } else if (absent) {
                  cellClass = "bg-rose-500 text-white shadow-xs shadow-rose-300 ring-4 ring-white hover:bg-rose-600";
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
                    className={`h-7, w-7 flex flex-col items-center justify-center font-bold text-[10px] rounded-lg mx-auto relative cursor-pointer group transition-all h-7 w-7 ${cellClass} ${
                      isSelected ? 'ring-2 ring-slate-800 ring-offset-1 scale-110 z-10' : ''
                    }`}
                  >
                    <span>{slot.day}</span>
                    {hasPunches && !isSelected && (
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
                <span className="w-2.5 h-2.5 rounded bg-amber-400 block" /> Late
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
                <span>Log: {calendarYear}-{String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}</span>
              </div>
              {(() => {
                const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                const rawPunches = punchLogs[targetDate]?.punches || [];
                const punchesList = rawPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                return punchesList.length > 0 && (
                  <span className="bg-teal-500/20 text-teal-300 font-mono text-[9px] px-1.5 py-0.5 rounded font-black uppercase">
                    {punchesList.length} logs
                  </span>
                );
              })()}
            </div>

            {(() => {
              const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
              const rawPunches = punchLogs[targetDate]?.punches || [];
              const punchesList = rawPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
              
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
                    return (
                      <div key={idx} className="flex justify-between items-center bg-slate-805/80 bg-slate-800 hover:bg-slate-750 p-2 rounded-xl transition-all border border-slate-850 border-slate-700/30">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isIN ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className="text-[11px] font-mono font-bold tracking-tight">{time}</span>
                          <span className={`text-[9px] uppercase font-black tracking-widest ${isIN ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isIN ? 'Check-In' : 'Check-Out'}
                          </span>
                        </div>
                        <button 
                          type="button" 
                          onClick={async () => {
                            const filtered = punchesList.filter((_, pIdx) => pIdx !== idx);
                            const docRef = doc(db, 'employees', employee.id, 'punches', targetDate);
                            if (filtered.length === 0) {
                              await deleteDoc(docRef);
                            } else {
                              await setDoc(docRef, {
                                id: targetDate,
                                employeeId: employee.id,
                                date: targetDate,
                                punches: filtered
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
                    await setDoc(docRef, {
                      id: targetDate,
                      employeeId: employee.id,
                      date: targetDate,
                      punches: updated
                    });
                  }}
                  className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9.5px] font-black uppercase transition-colors cursor-pointer text-center"
                >
                  + IN
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const targetDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                    const currentPunches = punchLogs[targetDate]?.punches || [];
                    const timeInput = document.getElementById('manual-profile-punch-time') as HTMLInputElement | null;
                    const val = timeInput?.value || '17:00';
                    const newLog = `${val} OUT`;
                    const updated = [...currentPunches, newLog].sort((a,b) => a.localeCompare(b));
                    const docRef = doc(db, 'employees', employee.id, 'punches', targetDate);
                    await setDoc(docRef, {
                      id: targetDate,
                      employeeId: employee.id,
                      date: targetDate,
                      punches: updated
                    });
                  }}
                  className="flex-1 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-[9.5px] font-black uppercase transition-colors cursor-pointer text-center"
                >
                  + OUT
                </button>
              </div>
            </div>
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
                <label className="block mb-1 text-slate-400">Email Address</label>
                <input 
                  type="email" 
                  value={editedEmail} 
                  onChange={(e) => setEditedEmail(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
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
                <label className="block mb-1 text-slate-400">Date of Birth</label>
                <input 
                  type="text" 
                  value={editedDob} 
                  onChange={(e) => setEditedDob(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Join Date</label>
                <input 
                  type="text" 
                  value={editedJoinDate} 
                  onChange={(e) => setEditedJoinDate(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800"
                />
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

              <div>
                <label className="block mb-1 text-slate-400">Work Model</label>
                <select 
                  value={editedWorkModel} 
                  onChange={(e) => setEditedWorkModel(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="Hybrid">Hybrid</option>
                  <option value="Remote">Remote</option>
                  <option value="On-Site">On-Site</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-slate-400">Employment Type</label>
                <select 
                  value={editedEmploymentType} 
                  onChange={(e) => setEditedEmploymentType(e.target.value)}
                  className="w-full bg-slate-50 border-0 focus:ring-1 focus:ring-teal-500 rounded-xl p-2.5 text-slate-800 font-semibold"
                >
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
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
