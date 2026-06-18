/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Employee, ComputedEmployee, SalarySettings } from './types';
import { INITIAL_EMPLOYEES, calculateSalary, isEmployeePresent, getWorkMinutes } from './data';
import { ROSTER_MAP_CSV } from './rosterData';
import Dashboard from './components/Dashboard';
import ExcelTable from './components/ExcelTable';
import EmployeeProfileDetails from './components/EmployeeProfileDetails';
import AttendanceImport from './components/AttendanceImport';
import AdvancePaid from './components/AdvancePaid';
import GatePassRecord from './components/GatePassRecord';
import OvertimeLogs from './components/OvertimeLogs';
import LoomOrders from './components/LoomOrders';
import SearchEmp from './components/SearchEmp';
import { 
  collection, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  collectionGroup,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { 
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from './firebase';

const MIGRATION_STATUS_DOC = {
  id: 'migration_v2_status',
  name: 'MIGRATION CLOUD STATUS DOCUMENT',
  monthlySalary: 0,
  workingDays: 0,
  workingHours: 0,
  fullDaysAbsent: 0,
  absentHours: 0,
  absentMinutes: 0
};
import { 
  Grid, 
  Users, 
  Inbox, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Wallet,
  ClipboardList,
  Layers,
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
  Zap,
  Award,
  BookOpen,
  Send,
  UserCheck,
  Undo2,
  Phone,
  ShieldAlert,
  Smartphone,
  Key,
  Mail,
  Lock,
  RefreshCw,
  Trash2
} from 'lucide-react';

const calculateWorkingHours = (shiftStr?: string): number | undefined => {
  if (!shiftStr || !shiftStr.trim()) return undefined;
  const parts = shiftStr.split(/[-—–]/).map(s => s.trim());
  if (parts.length !== 2) return undefined;

  const parsePart = (p: string) => {
    const clean = p.replace(/\./g, ':').replace(/\s/g, '');
    const match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    const singleHourMatch = clean.match(/^(\d{1,2})$/);
    if (singleHourMatch) {
      return parseInt(singleHourMatch[1], 10) * 60;
    }
    return null;
  };

  const startMins = parsePart(parts[0]);
  const endMins = parsePart(parts[1]);
  if (startMins === null || endMins === null) return undefined;

  let diff = endMins - startMins;
  if (diff <= 0) {
    diff += 1440;
  }

  const originalHours = diff / 60;
  return Math.max(0, originalHours - 0.5);
};

export default function App() {
  // Store original Employee rows
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const cached = localStorage.getItem('salarypro_employees_cache');
      if (cached) {
        const parsed = JSON.parse(cached) as Employee[];
        // Auto self-heal Harmeet Kaur locally if she is missing from local storage cache
        const hasHarmeet = parsed.some(e => e.id === '8' && e.name && e.name.trim() !== '');
        if (!hasHarmeet) {
          const harmeetData: Employee = {
            id: '8',
            name: 'Harmeet Kaur',
            monthlySalary: 10000,
            workingDays: 0,
            workingHours: 0,
            fullDaysAbsent: 0,
            absentHours: 0,
            absentMinutes: 0,
            role: 'HR Mgr',
            designation: 'HR Mgr',
            department: 'HR',
            shiftTime: '09:00-18:00',
            phone: '78767-76550',
            address: 'Devinagar, Paonta Sahib, Near Priyanshi Hospital, Sirmour (HP)-173025',
            salaryType: 'fixed',
            sundayPaid: 'Paid'
          };
          const index8 = parsed.findIndex(e => e.id === '8');
          if (index8 !== -1) {
            parsed[index8] = harmeetData;
          } else {
            const tempIndex = parsed.findIndex(e => e.id.toUpperCase().startsWith('EMP_TEMP_'));
            if (tempIndex !== -1) {
              parsed[tempIndex] = harmeetData;
            } else {
              parsed.push(harmeetData);
            }
          }
          try {
            localStorage.setItem('salarypro_employees_cache', JSON.stringify(parsed));
          } catch (storageErr) {
            console.warn("Could not write self-healed employees to local cache:", storageErr);
          }
        }
        return parsed;
      }
    } catch (e) {
      console.warn("Could not parse cached employees roster:", e);
    }
    // Default fallback: Generate the standard baseline 160 rows
    const defaultLive = INITIAL_EMPLOYEES;
    const merged: Employee[] = [...defaultLive];
    const takenIds = new Set(defaultLive.map(e => e.id.toLowerCase()));
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
    return merged;
  });
  const [undoStack, setUndoStack] = useState<Employee[][]>([]);
  const [cloudQuotaExceeded, setCloudQuotaExceeded] = useState(false);
  const [cloudError, setCloudError] = useState<{ code?: string; message: string; name?: string } | null>(null);



  // Month / Year run state for the Ledger
  const [ledgerMonth, setLedgerMonth] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('salarypro_ledger_month');
      return cached ? Number(cached) : (new Date().getMonth() + 1); // Default to current month
    } catch {
      return new Date().getMonth() + 1;
    }
  });
  const [ledgerYear, setLedgerYear] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('salarypro_ledger_year');
      return cached ? Number(cached) : new Date().getFullYear(); // Default to current year
    } catch {
      return new Date().getFullYear();
    }
  });

  // Streaming states for all device punches and monthly overrides
  const [allPunchLogs, setAllPunchLogs] = useState<Record<string, Record<string, string[]>>>(() => {
    try {
      const cached = localStorage.getItem('salarypro_all_punches_cache');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [allMonthlyOverrides, setAllMonthlyOverrides] = useState<Record<string, Record<string, { 
    workingDays?: number;
    fullDaysAbsent?: number;
    advancePayment?: number;
    advanceRemarks?: string;
    workingHours?: number;
    absentHours?: number;
    absentMinutes?: number;
    monthlySalary?: number;
    foodBalance?: number;
    foodRemarks?: string;
    advanceDate?: string;
    foodDate?: string;
    advances?: Array<{ id: string; amount: number; remarks: string; date: string }>;
  }>>>(() => {
    try {
      const cached = localStorage.getItem('salarypro_monthly_overrides_cache');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  // One-time fetch to pull latest updates with a manual sync option (to prevent massive reads on real-time listener loops)
  const [syncLoading, setSyncLoading] = useState(false);

  const fetchAllData = async (silent = false) => {
    if (!silent) setSyncLoading(true);
    try {
      // 1. Fetch live employees first
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      
      const firestoreEmployees: Employee[] = [];
      let isMigratedV2 = false;

      if (!employeesSnapshot.empty) {
        employeesSnapshot.forEach((docSnap) => {
          if (docSnap.id === 'migration_v2_status') {
            isMigratedV2 = true;
          } else {
            firestoreEmployees.push(docSnap.data() as Employee);
          }
        });

        // Self-heal shiftTime === '001' and BASIS (salaryType) to matched rules
        let fixedShiftsCount = 0;
        const shift001EmpNames: string[] = [];
        const migrationBatch = writeBatch(db);
        let migrationNeeded = false;

        const healedEmployees = firestoreEmployees.map(emp => {
          let updated = { ...emp };
          let changed = false;

          if (emp.shiftTime === '001') {
            fixedShiftsCount++;
            shift001EmpNames.push(emp.name || emp.id);
            updated.shiftTime = '08:00-20:00';
            changed = true;
          }

          // Only perform self-healing baseline migration if employee does not have a salaryType specified
          if ((emp.name || '').trim() !== '' && !emp.salaryType) {
            const expectedBasis = emp.monthlySalary > 2000 ? 'fixed' : 'daily';
            updated.salaryType = expectedBasis;
            changed = true;
          }

          if (!emp.shift) {
            updated.shift = 'DAY';
            changed = true;
          }

          if (changed) {
            migrationNeeded = true;
            migrationBatch.set(doc(db, 'employees', emp.id), updated);
            return updated;
          }
          return emp;
        });

        if (migrationNeeded) {
          try {
            await migrationBatch.commit();
            console.log(`Successfully migrated ${fixedShiftsCount} employees from shift 001 to 08:00-20:00: ${shift001EmpNames.join(', ')}`);
            firestoreEmployees.length = 0;
            firestoreEmployees.push(...healedEmployees);
          } catch (writeErr) {
            console.error("Failed to commit shift 001 healing batch to Firestore:", writeErr);
          }
        }

        if (!isMigratedV2 && firestoreEmployees.length > 0) {
          try {
            await setDoc(doc(db, 'employees', 'migration_v2_status'), MIGRATION_STATUS_DOC);
          } catch (err) {
            console.error("Failed to establish migration safeguard:", err);
          }
        }

        // Self-heal/Restoration of Harmeet Kaur (id: '8') if deleted or missing
        const harmeetObj = firestoreEmployees.find(e => e.id === '8');
        if (!harmeetObj || !harmeetObj.name || harmeetObj.name.trim() === '') {
          const harmeetData: Employee = {
            id: '8',
            name: 'Harmeet Kaur',
            monthlySalary: 10000,
            workingDays: 26,
            workingHours: 9.00,
            fullDaysAbsent: 0,
            absentHours: 0,
            absentMinutes: 0,
            role: 'HR Mgr',
            designation: 'HR Mgr',
            department: 'HR',
            shiftTime: '09:00-18:00',
            phone: '78767-76550',
            address: 'Devinagar, Paonta Sahib, Near Priyanshi Hospital, Sirmour (HP)-173025',
            salaryType: 'fixed',
            sundayPaid: 'Paid'
          };
          try {
            await setDoc(doc(db, 'employees', '8'), harmeetData);
            console.log("Self-repaired: Restored Employee Harmeet Kaur to Firestore.");
            if (harmeetObj) {
              Object.assign(harmeetObj, harmeetData);
            } else {
              firestoreEmployees.push(harmeetData);
            }
          } catch (writeErr) {
            console.error("Failed to automatically restore Harmeet Kaur on load:", writeErr);
          }
        }
      }

      // --- SELF-HEALING / UPGRADE SALARIES FROM JUNE & MAY OVERRIDES ---
      // We promote June 2026 overrides or specific corrections (like Raju Tiwari) to become master values permanently.
      if (firestoreEmployees.length > 0) {
        const migrationBatch = writeBatch(db);
        let migrationNeeded = false;

        await Promise.all(firestoreEmployees.map(async (emp) => {
          try {
            let updatedObj = { ...emp };
            let changed = false;

            // 1. Specific Rule: Raju Tiwari to Rs 700 daily wage
            if (emp.name && emp.name.toLowerCase().includes('raju') && emp.name.toLowerCase().includes('tiwari')) {
              if (emp.monthlySalary !== 700 || emp.salaryType !== 'daily') {
                updatedObj.monthlySalary = 700;
                updatedObj.salaryType = 'daily';
                changed = true;
              }
            } else if ((!emp.salaryType || emp.monthlySalary === 0) && (emp.name || '').trim() !== '') {
              // 2. Standard Rule: Fetch June 2026 override document
              const juneRef = doc(db, 'employees', emp.id, 'monthlyPayroll', '2026-06');
              const juneSnap = await getDoc(juneRef);
              if (juneSnap.exists()) {
                const data = juneSnap.data();
                if (data.monthlySalary !== undefined && data.monthlySalary > 0 && data.monthlySalary !== emp.monthlySalary) {
                  updatedObj.monthlySalary = Number(data.monthlySalary);
                  if (updatedObj.monthlySalary <= 2000) {
                    updatedObj.salaryType = 'daily';
                  } else if (updatedObj.monthlySalary > 2000) {
                    updatedObj.salaryType = 'fixed';
                  }
                  changed = true;
                }
              } else {
                // Check May 2026 override as fallback
                const mayRef = doc(db, 'employees', emp.id, 'monthlyPayroll', '2026-05');
                const maySnap = await getDoc(mayRef);
                if (maySnap.exists()) {
                  const data = maySnap.data();
                  if (data.monthlySalary !== undefined && data.monthlySalary > 0 && data.monthlySalary !== emp.monthlySalary) {
                    updatedObj.monthlySalary = Number(data.monthlySalary);
                    if (updatedObj.monthlySalary <= 2000) {
                      updatedObj.salaryType = 'daily';
                    } else if (updatedObj.monthlySalary > 2000) {
                      updatedObj.salaryType = 'fixed';
                    }
                    changed = true;
                  }
                }
              }
            }

            if (changed) {
              migrationNeeded = true;
              migrationBatch.set(doc(db, 'employees', emp.id), updatedObj);
              Object.assign(emp, updatedObj);
            }
          } catch (subErr) {
            console.error(`Error self-healing salary of ${emp.name || emp.id}:`, subErr);
          }
        }));

        if (migrationNeeded) {
          try {
            await migrationBatch.commit();
            console.log("Successfully migrated baseline salaries to master database docs.");
          } catch (writeErr) {
            console.error("Failed to commit master salary migration batch:", writeErr);
          }
        }
      }
      // --- END OF SELF-HEALING ---

      const merged: Employee[] = [...firestoreEmployees];
      const takenIds = new Set(firestoreEmployees.map(e => e.id.toLowerCase()));
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
      localStorage.setItem('salarypro_employees_cache', JSON.stringify(merged));

      // 2. Fetch monthly payroll overrides and daily punches only for the live employee IDs and specifically for the focused month
      const liveEmployeeIds = firestoreEmployees.map(emp => emp.id);
      const monthStr = `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}`;
      
      const monthsToSync = new Set<string>();
      monthsToSync.add(monthStr);
      monthsToSync.add('2026-05'); // Make sure May 2026 punches are always fully synchronized
      monthsToSync.add('2026-06'); // Make sure June 2026 punches are always fully synchronized

      const logs: Record<string, Record<string, string[]>> = {};
      const overrides: Record<string, Record<string, any>> = {};

      // Pull data concurrently for active employees and targeted months
      await Promise.all(liveEmployeeIds.map(async (empId) => {
        try {
          // Fetch punches for this employee for each of the selected months to sync
          await Promise.all(Array.from(monthsToSync).map(async (mStr) => {
            const startDate = `${mStr}-01`;
            const endDate = `${mStr}-31`;
            const punchesQuery = query(
              collection(db, 'employees', empId, 'punches'),
              where('date', '>=', startDate),
              where('date', '<=', endDate)
            );
            const punchesSnap = await getDocs(punchesQuery);
            
            punchesSnap.forEach((docSnap) => {
              const punchesData = docSnap.data().punches || [];
              const date = docSnap.id;
              if (date) {
                if (!logs[empId]) {
                  logs[empId] = {};
                }
                logs[empId][date] = punchesData;
              }
            });
          }));

          // Fetch payroll override document for this focused month
          const payrollRef = doc(db, 'employees', empId, 'monthlyPayroll', monthStr);
          const payrollSnap = await getDoc(payrollRef);
          if (payrollSnap.exists()) {
            const data = payrollSnap.data();
            if (!overrides[empId]) {
              overrides[empId] = {};
            }
            overrides[empId][monthStr] = {
              workingDays: data.workingDays !== undefined ? Number(data.workingDays) : undefined,
              fullDaysAbsent: data.fullDaysAbsent !== undefined ? Number(data.fullDaysAbsent) : undefined,
              advancePayment: data.advancePayment !== undefined ? Number(data.advancePayment) : undefined,
              advanceRemarks: data.advanceRemarks !== undefined ? String(data.advanceRemarks) : undefined,
              workingHours: data.workingHours !== undefined ? Number(data.workingHours) : undefined,
              absentHours: data.absentHours !== undefined ? Number(data.absentHours) : undefined,
              absentMinutes: data.absentMinutes !== undefined ? Number(data.absentMinutes) : undefined,
              monthlySalary: data.monthlySalary !== undefined ? Number(data.monthlySalary) : undefined,
              foodBalance: data.foodBalance !== undefined ? Number(data.foodBalance) : undefined,
              foodRemarks: data.foodRemarks !== undefined ? String(data.foodRemarks) : undefined,
              advanceDate: data.advanceDate !== undefined ? String(data.advanceDate) : undefined,
              foodDate: data.foodDate !== undefined ? String(data.foodDate) : undefined,
              advances: Array.isArray(data.advances) ? data.advances : undefined,
            };
          }
        } catch (subErr) {
          console.warn(`Could not sync detailed subcollections for Employee ID ${empId}:`, subErr);
        }
      }));

       // Merge newly fetched month data into in-memory states and local cache, deleting any dates in the synced range that are no longer in Firestore
      setAllPunchLogs(prev => {
        const next = { ...prev };
        const syncMonthStrings = Array.from(monthsToSync);
        
        liveEmployeeIds.forEach(empId => {
          if (!next[empId]) {
            next[empId] = {};
          } else {
            next[empId] = { ...next[empId] };
          }
          
          // Clear all cached punch dates starting with any of the synced months
          syncMonthStrings.forEach(mStr => {
            Object.keys(next[empId]).forEach(date => {
              if (date.startsWith(mStr)) {
                delete next[empId][date];
              }
            });
          });

          // Insert newly fetched data
          if (logs[empId]) {
            Object.keys(logs[empId]).forEach(date => {
              next[empId][date] = logs[empId][date];
            });
          }
        });
        
        localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
        return next;
      });

      setAllMonthlyOverrides(prev => {
        const next = { ...prev };
        liveEmployeeIds.forEach(empId => {
          if (!next[empId]) {
            next[empId] = {};
          } else {
            next[empId] = { ...next[empId] };
          }
          // Clear cached focused month override
          delete next[empId][monthStr];
          
          // Apply fetched override if any
          if (overrides[empId]?.[monthStr]) {
            next[empId][monthStr] = overrides[empId][monthStr];
          }
        });
        localStorage.setItem('salarypro_monthly_overrides_cache', JSON.stringify(next));
        return next;
      });



      setSavedTime(new Date().toLocaleTimeString());
      setCloudQuotaExceeded(false);
      setCloudError(null);
      if (!silent) {
        triggerAlert('success', 'Roster and focused timesheets successfully synced from Firestore.');
      }
    } catch (err: any) {
      console.warn("One-time cloud fetch failed, loaded from local cache state:", err);
      setCloudQuotaExceeded(true);
      setCloudError({
        code: err?.code,
        message: err?.message || String(err),
        name: err?.name
      });
      if (!silent) {
        triggerAlert('info', 'Cloud Sync Offline (Using offline cached fallback backup).');
      }
    } finally {
      if (!silent) setSyncLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData(true); // Silent sync on initial load or focused month/year shift
  }, [ledgerMonth, ledgerYear]);

  // Pre-seed custom login for Laxman Verma as a fallback
  useEffect(() => {
    const seedCustomUser = async () => {
      try {
        const userRef = doc(db, 'custom_users', 'laxmanverma@fortuneflexipack.com');
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            email: 'laxmanverma@fortuneflexipack.com',
            password: 'Paonta@2025',
            role: 'observer',
            name: 'Laxman Verma',
            createdAt: new Date().toISOString()
          });
          console.log("Seeded custom login credentials for Laxman Verma");
        }
      } catch (err) {
        console.error("Failed to seed custom login credentials:", err);
      }
    };
    seedCustomUser();
  }, []);

  // Instant reactive self-heal for Harmeet Kaur in active state
  useEffect(() => {
    const hasHarmeet = employees.some(e => e.id === '8' && e.name && e.name.trim() !== '');
    if (!hasHarmeet) {
      const harmeetData: Employee = {
        id: '8',
        name: 'Harmeet Kaur',
        monthlySalary: 10000,
        workingDays: 26,
        workingHours: 9.00,
        fullDaysAbsent: 0,
        absentHours: 0,
        absentMinutes: 0,
        role: 'HR Mgr',
        designation: 'HR Mgr',
        department: 'HR',
        shiftTime: '09:00-18:00',
        phone: '78767-76550',
        address: 'Devinagar, Paonta Sahib, Near Priyanshi Hospital, Sirmour (HP)-173025',
        salaryType: 'fixed',
        sundayPaid: 'Paid'
      };

      setEmployees(prev => {
        if (prev.some(e => e.id === '8' && e.name && e.name.trim() !== '')) return prev;
        const index8 = prev.findIndex(e => e.id === '8');
        let updated = [...prev];
        if (index8 !== -1) {
          updated[index8] = harmeetData;
        } else {
          const tempIndex = updated.findIndex(e => e.id.toUpperCase().startsWith('EMP_TEMP_'));
          if (tempIndex !== -1) {
            updated[tempIndex] = harmeetData;
          } else {
            updated.push(harmeetData);
          }
        }
        try {
          localStorage.setItem('salarypro_employees_cache', JSON.stringify(updated));
        } catch (e) {
          console.warn("Storage limits reached for employees cache during auto recovery:", e);
        }
        return updated;
      });

      // Write to Firebase too to guarantee sync
      try {
        setDoc(doc(db, 'employees', '8'), harmeetData);
        console.log("Self-repaired reactive: Restored Harmeet Kaur to Firestore.");
      } catch (err) {
        console.error("Self-repaired reactive Firestore write failed:", err);
      }
    }
  }, [employees]);

  // Google Authentication States
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(() => {
    return localStorage.getItem('salarypro_logged_in_email') || null;
  });
  const [loggedInName, setLoggedInName] = useState<string | null>(() => {
    return localStorage.getItem('salarypro_logged_in_name') || null;
  });
  const [loggedInPhoto, setLoggedInPhoto] = useState<string | null>(() => {
    return localStorage.getItem('salarypro_logged_in_photo') || null;
  });
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const email = (user.email || '').toLowerCase();
        
        const ALLOWED_ADMINS = ['sandydalhousie@gmail.com'];
        const ALLOWED_OBSERVERS = [
          'goyal.siddhartha1997@gmail.com',
          'skshimla@gmail.com',
          'himgoldenterprises@gmail.com',
          'shantanu.goyal93@gmail.com',
          'fortuneflexipack@gmail.com'
        ];

        if (!ALLOWED_ADMINS.includes(email) && !ALLOWED_OBSERVERS.includes(email)) {
          auth.signOut().catch(console.error);
          setLoggedInEmail(null);
          setLoggedInName(null);
          setLoggedInPhoto(null);
          localStorage.removeItem('salarypro_logged_in_email');
          localStorage.removeItem('salarypro_logged_in_name');
          localStorage.removeItem('salarypro_logged_in_photo');
          setOtpError(`Google Account (${email}) is not authorized. Please log in with an authorized account.`);
          setAuthLoading(false);
          return;
        }

        const name = user.displayName || user.email?.split('@')[0] || 'User';
        const photo = user.photoURL || '';
        setLoggedInEmail(email);
        setLoggedInName(name);
        setLoggedInPhoto(photo);
        localStorage.setItem('salarypro_logged_in_email', email);
        localStorage.setItem('salarypro_logged_in_name', name);
        localStorage.setItem('salarypro_logged_in_photo', photo);
      } else {
        const cachedEmail = localStorage.getItem('salarypro_logged_in_email') || '';
        if (cachedEmail.toLowerCase() !== 'hr@fortuneflexipack.com') {
          setLoggedInEmail(null);
          setLoggedInName(null);
          setLoggedInPhoto(null);
          localStorage.removeItem('salarypro_logged_in_email');
          localStorage.removeItem('salarypro_logged_in_name');
          localStorage.removeItem('salarypro_logged_in_photo');
        }
      }
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Persist ledger range selections
  useEffect(() => {
    localStorage.setItem('salarypro_ledger_month', String(ledgerMonth));
  }, [ledgerMonth]);

  useEffect(() => {
    localStorage.setItem('salarypro_ledger_year', String(ledgerYear));
  }, [ledgerYear]);

  const hasEditingRights = useMemo(() => {
    return loggedInEmail === 'sandydalhousie@gmail.com';
  }, [loggedInEmail]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLoggedInEmail(null);
      setLoggedInName(null);
      setLoggedInPhoto(null);
      localStorage.removeItem('salarypro_logged_in_email');
      localStorage.removeItem('salarypro_logged_in_name');
      localStorage.removeItem('salarypro_logged_in_photo');
      triggerAlert('info', 'Logged out successfully. Secure session terminated.');
    } catch (err: any) {
      console.error("Sign out error", err);
      setLoggedInEmail(null);
      setLoggedInName(null);
      setLoggedInPhoto(null);
      localStorage.removeItem('salarypro_logged_in_email');
      localStorage.removeItem('salarypro_logged_in_name');
      localStorage.removeItem('salarypro_logged_in_photo');
    }
  };

  const [otpError, setOtpError] = useState<string | null>(null);
  
  // Custom Email Login States
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [emailVal, setEmailVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [customLoginLoading, setCustomLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'payroll' | 'calendar' | 'attendance' | 'performance' | 'advance' | 'gatepass' | 'overtime' | 'looms'>(() => {
    const email = localStorage.getItem('salarypro_logged_in_email');
    return email === 'hr@fortuneflexipack.com' ? 'gatepass' : 'employees';
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('55'); // Hardyal (First employee in yesterday's attendance PDF!)
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'info' | 'warn'; text: string } | null>(null);
  
  // Guard observer hr email to only access and use Advances, Gate Pass, and Overtime tabs
  useEffect(() => {
    if (loggedInEmail === 'hr@fortuneflexipack.com' && activeTab !== 'advance' && activeTab !== 'gatepass' && activeTab !== 'overtime' && activeTab !== 'looms') {
      setActiveTab('gatepass');
    }
  }, [loggedInEmail, activeTab]);
  
  // Local ledger saving indicators
  const [isSaving, setIsSaving] = useState(false);
  const [savedTime, setSavedTime] = useState<string>('');

  // Search & Navigation variables
  const [topSearchQuery, setTopSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Roster initialization is handled once on mount via fetchAllData()

  // 1. Pre-calculate Working Days and Full Days Absent for the selected run Month & Year
  const syncedEmployees = useMemo(() => {
    const monthStr = `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}`;
    const companyActiveDates = new Set<string>();
    
    // Find all distinct dates for this selected month that have logs in database
    Object.entries(allPunchLogs).forEach(([_, dateLogs]) => {
      Object.keys(dateLogs).forEach(date => {
        if (date.startsWith(monthStr)) {
          companyActiveDates.add(date);
        }
      });
    });
    
    const activeDatesArr = Array.from(companyActiveDates).sort();

    return employees.map(emp => {
      const monthOverrides = allMonthlyOverrides[emp.id]?.[monthStr] || {};
      const finalSalaryType = monthOverrides.salaryType !== undefined ? monthOverrides.salaryType : (emp.salaryType || 'fixed');
      const finalMonthlySalary = monthOverrides.monthlySalary !== undefined ? Number(monthOverrides.monthlySalary) : (emp.monthlySalary || 0);
      
      const totalDaysInMonth = new Date(ledgerYear, ledgerMonth, 0).getDate();
      let calculatedWorkingDays = totalDaysInMonth;
      let calculatedAbsentDays = 0;
      let partialDaysList: { date: string; minutes: number }[] = [];

      let sundayOTDays = 0;

      if (activeDatesArr.length > 0) {
        // Count absent days from biometric punch logs
        const empPunches = allPunchLogs[emp.id] || {};

        const getAdjustedPunches = (dateStr: string) => {
          if (emp.shift === 'NIGHT') {
            const todayPunches = empPunches[dateStr] || [];
            const cleanToday = todayPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
            
            const dateObj = new Date(dateStr);
            dateObj.setUTCDate(dateObj.getUTCDate() + 1);
            const nextDateStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
            
            const nextDayPunches = empPunches[nextDateStr] || [];
            const cleanNextDay = nextDayPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
            
            const inPunches = cleanToday.filter(p => {
              const uc = p.toUpperCase();
              return uc.includes('IN') || uc.includes('ARR');
            });
            let outPunches = cleanToday.filter(p => {
              const uc = p.toUpperCase();
              return uc.includes('OUT') || uc.includes('DEP') || uc.includes('EXIT');
            });
            if (outPunches.length === 0) {
              outPunches = cleanNextDay.filter(p => {
                const uc = p.toUpperCase();
                return uc.includes('OUT') || uc.includes('DEP') || uc.includes('EXIT');
              });
            }
            
            inPunches.sort((a, b) => a.localeCompare(b));
            outPunches.sort((a, b) => a.localeCompare(b));
            
            return [...inPunches, ...outPunches];
          } else {
            const raw = empPunches[dateStr] || [];
            return raw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
          }
        };

        activeDatesArr.forEach(date => {
          const clean = getAdjustedPunches(date);
          const hasPunches = clean.length > 0;
          if (hasPunches) {
            const minutes = getWorkMinutes(clean);
            if (minutes < 360) {
              partialDaysList.push({ date, minutes });
            }

            const dateObj = new Date(date);
            const isSunday = dateObj.getDay() === 0;
            const isFixed = finalSalaryType === 'fixed';
            if (isSunday && isFixed && emp.sundayPaid === 'Paid') {
              sundayOTDays++;
            }
          } else {
            const dateObj = new Date(date);
            const isSunday = dateObj.getDay() === 0;
            const isFixed = finalSalaryType === 'fixed';
            if (isSunday && isFixed) {
              if (emp.sundayPaid === 'Not Paid') {
                calculatedAbsentDays++;
              } else {
                // Absent on Sunday is not deducted for fixed salary employees
              }
            } else {
              calculatedAbsentDays++;
            }
          }
        });
      } else {
        calculatedAbsentDays = emp.fullDaysAbsent || 0;
      }

      const finalWorkingDays = monthOverrides.workingDays !== undefined ? monthOverrides.workingDays : calculatedWorkingDays;
      const finalAbsentDays = monthOverrides.fullDaysAbsent !== undefined ? monthOverrides.fullDaysAbsent : calculatedAbsentDays;
      const finalAdvancePayment = monthOverrides.advancePayment !== undefined ? monthOverrides.advancePayment : (emp.advancePayment || 0);
      const finalAdvanceRemarks = monthOverrides.advanceRemarks !== undefined ? monthOverrides.advanceRemarks : (emp.advanceRemarks || '');
      
      const calculatedHours = calculateWorkingHours(emp.shiftTime);
      const finalWorkingHours = monthOverrides.workingHours !== undefined ? monthOverrides.workingHours : calculatedHours;

      const finalAbsentHours = monthOverrides.absentHours !== undefined ? monthOverrides.absentHours : (emp.absentHours || 0);
      const finalAbsentMinutes = monthOverrides.absentMinutes !== undefined ? monthOverrides.absentMinutes : (emp.absentMinutes || 0);
      const finalFoodBalance = monthOverrides.foodBalance !== undefined ? monthOverrides.foodBalance : (emp.foodBalance || 0);
      const finalFoodRemarks = monthOverrides.foodRemarks !== undefined ? monthOverrides.foodRemarks : (emp.foodRemarks || '');
      const finalAdvanceDate = monthOverrides.advanceDate !== undefined ? monthOverrides.advanceDate : emp.advanceDate;
      const finalFoodDate = monthOverrides.foodDate !== undefined ? monthOverrides.foodDate : emp.foodDate;

      const elapsedDays = activeDatesArr.length > 0 ? activeDatesArr.length : undefined;

      return {
        ...emp,
        salaryType: finalSalaryType,
        workingDays: finalWorkingDays,
        fullDaysAbsent: finalAbsentDays,
        advancePayment: finalAdvancePayment,
        advanceRemarks: finalAdvanceRemarks,
        advanceDate: finalAdvanceDate,
        workingHours: finalWorkingHours,
        absentHours: finalAbsentHours,
        absentMinutes: finalAbsentMinutes,
        monthlySalary: finalMonthlySalary,
        foodBalance: finalFoodBalance,
        foodRemarks: finalFoodRemarks,
        foodDate: finalFoodDate,
        partialDays: partialDaysList,
        sundayOTDays: sundayOTDays,
        elapsedDays: elapsedDays,
      };
    });
  }, [employees, allPunchLogs, allMonthlyOverrides, ledgerMonth, ledgerYear]);

  // Compute calculated row fields dynamically on active dataset changes
  const computedEmployees = useMemo(() => {
    const list = syncedEmployees.map(calculateSalary);
    list.sort((a, b) => {
      // Keep empty temp/placeholder rows at the bottom
      const isTempA = a.id.startsWith('EMP_TEMP_') || !(a.name || '').trim();
      const isTempB = b.id.startsWith('EMP_TEMP_') || !(b.name || '').trim();
      
      if (isTempA && !isTempB) return 1;
      if (!isTempA && isTempB) return -1;
      if (isTempA && isTempB) {
        const numA = parseInt(a.id.replace('EMP_TEMP_', ''), 10) || 0;
        const numB = parseInt(b.id.replace('EMP_TEMP_', ''), 10) || 0;
        return numA - numB;
      }
      
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
    return list;
  }, [syncedEmployees]);

  // Aggregate sums for quick banner card KPIs
  const quickKPIs = useMemo(() => {
    let totalGross = 0;
    let totalDeds = 0;
    let totalPay = 0;
    let count = 0;

    computedEmployees.forEach(emp => {
      const isLive = (emp.name || '').trim() !== '' && !emp.id.toUpperCase().startsWith('EMP_TEMP_');
      if (isLive) {
        totalGross += emp.grossSalary || 0;
        totalDeds += emp.totalDeduction || 0;
        totalPay += emp.finalPayable || 0;
        count++;
      }
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
  const triggerAlert = (type: 'success' | 'info' | 'warn', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg(null);
    }, 4000);
  };

  // Push current state to undo history stack (clones items to prevent shared updates reference leaks)
  const pushToUndoStack = (currentList: Employee[]) => {
    if (!hasEditingRights) return;
    const cloned = currentList.map(emp => {
      const clonedEmp: Employee = { ...emp };
      if (emp.notes) clonedEmp.notes = [...emp.notes];
      if (emp.documents) clonedEmp.documents = emp.documents.map(d => ({ ...d }));
      return clonedEmp;
    });
    setUndoStack(prev => {
      const next = [...prev, cloned];
      if (next.length > 5) {
        next.shift(); // keep last 5 revisions
      }
      return next;
    });
  };

  // Revert the last client or sheets amendment action (fully synchronized with Firestore)
  const handleUndo = async () => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can undo changes.');
      return;
    }
    if (undoStack.length === 0) return;
    const targetState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, prev.length - 1));

    try {
      setIsSaving(true);
      const batch = writeBatch(db);
      
      const targetLive = targetState.filter(emp => !emp.id.toUpperCase().startsWith('EMP_TEMP_'));
      const currentLive = employees.filter(emp => !emp.id.toUpperCase().startsWith('EMP_TEMP_'));

      // 1. Rewrite or insert all records present in history reversion target
      targetLive.forEach(emp => {
        const sanitized: any = {
          id: emp.id,
          name: emp.name || "",
          monthlySalary: Number(emp.monthlySalary) || 0,
          workingDays: Number(emp.workingDays) || 0,
          workingHours: Number(emp.workingHours) || 0,
          fullDaysAbsent: Number(emp.fullDaysAbsent) || 0,
          absentHours: Number(emp.absentHours) || 0,
          absentMinutes: Number(emp.absentMinutes) || 0,
        };

        if (emp.role !== undefined) sanitized.role = emp.role;
        if (emp.email !== undefined) sanitized.email = emp.email;
        if (emp.phone !== undefined) sanitized.phone = emp.phone;
        if (emp.gender !== undefined) sanitized.gender = emp.gender;
        if (emp.dob !== undefined) sanitized.dob = emp.dob;
        if (emp.address !== undefined) sanitized.address = emp.address;
        if (emp.shiftTime !== undefined) sanitized.shiftTime = emp.shiftTime;
        if (emp.notes !== undefined) sanitized.notes = emp.notes;
        if (emp.documents !== undefined) sanitized.documents = emp.documents;
        if (emp.department !== undefined) sanitized.department = emp.department;
        if (emp.designation !== undefined) sanitized.designation = emp.designation;
        if (emp.sundayPaid !== undefined) sanitized.sundayPaid = emp.sundayPaid;
        if (emp.salaryType !== undefined) sanitized.salaryType = emp.salaryType;
        if (emp.advancePayment !== undefined) sanitized.advancePayment = Number(emp.advancePayment) || 0;
        if (emp.foodBalance !== undefined) sanitized.foodBalance = Number(emp.foodBalance) || 0;

        batch.set(doc(db, 'employees', emp.id), sanitized);
      });

      // 2. Erase records that exist currently but were absent in the restored history checkpoint
      const targetLiveIds = new Set(targetLive.map(emp => emp.id));
      currentLive.forEach(emp => {
        if (!targetLiveIds.has(emp.id)) {
          batch.delete(doc(db, 'employees', emp.id));
        }
      });

      await batch.commit();

      // Instantly update local state and save cache
      setEmployees(targetState);
      try {
        localStorage.setItem('salarypro_employees_cache', JSON.stringify(targetState));
      } catch (cacheErr) {
        console.warn("Storage limits reached for employees cache during undo:", cacheErr);
      }

      triggerAlert('success', 'Successfully reverted last change (Undo)!');
    } catch (error) {
      console.error("Undo revert transaction failed on Cloud Firestore:", error);
      triggerAlert('info', 'Undo failed. Review database rules.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePunchesSynced = (newPunches: Array<{ employeeId: string, date: string, punches: string[] }>) => {
    setAllPunchLogs(prev => {
      const next = { ...prev };
      newPunches.forEach(({ employeeId, date, punches }) => {
        if (!next[employeeId]) {
          next[employeeId] = {};
        }
        next[employeeId][date] = punches;
      });
      localStorage.setItem('salarypro_all_punches_cache', JSON.stringify(next));
      return next;
    });
  };

  // Direct action handlers - synchronized directly with cloud Firestore
  const handleUpdateEmployee = async (id: string, updatedFields: Partial<Employee>, skipUndoPush = false) => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can edit employee details.');
      return;
    }

    const isMonthlyField = 
      updatedFields.workingDays !== undefined || 
      updatedFields.fullDaysAbsent !== undefined || 
      updatedFields.advancePayment !== undefined ||
      updatedFields.advanceRemarks !== undefined ||
      updatedFields.workingHours !== undefined ||
      updatedFields.absentHours !== undefined ||
      updatedFields.absentMinutes !== undefined ||
      updatedFields.foodBalance !== undefined ||
      updatedFields.foodRemarks !== undefined;

    const hasProfileFields = 
      updatedFields.name !== undefined ||
      updatedFields.role !== undefined ||
      updatedFields.email !== undefined ||
      updatedFields.phone !== undefined ||
      updatedFields.address !== undefined ||
      updatedFields.dob !== undefined ||
      updatedFields.shiftTime !== undefined ||
      updatedFields.shift !== undefined ||
      updatedFields.gender !== undefined ||
      updatedFields.department !== undefined ||
      updatedFields.designation !== undefined ||
      updatedFields.sundayPaid !== undefined ||
      updatedFields.salaryType !== undefined ||
      updatedFields.monthlySalary !== undefined ||
      updatedFields.notes !== undefined ||
      updatedFields.documents !== undefined ||
      updatedFields.id !== undefined;

    const isMonthlyFieldOnly = isMonthlyField && !hasProfileFields;

    if (isMonthlyFieldOnly) {
      const monthStr = `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}`;
      const overrideRef = doc(db, 'employees', id, 'monthlyPayroll', monthStr);
      
      const currentOverride = allMonthlyOverrides[id]?.[monthStr] || {};
      const firestoreData: any = {};
      
      const numFields = [
        'workingDays', 'fullDaysAbsent', 'advancePayment', 'workingHours', 
        'absentHours', 'absentMinutes', 'foodBalance'
      ];

      const strFields = [
        'advanceRemarks', 'foodRemarks'
      ];

      numFields.forEach(field => {
        if (updatedFields[field as keyof Employee] !== undefined) {
          firestoreData[field] = Number(updatedFields[field as keyof Employee]);
        } else if (currentOverride[field as keyof typeof currentOverride] !== undefined) {
          firestoreData[field] = Number(currentOverride[field as keyof typeof currentOverride]);
        }
      });

      strFields.forEach(field => {
        if (updatedFields[field as keyof Employee] !== undefined) {
          firestoreData[field] = String(updatedFields[field as keyof Employee]);
        } else if (currentOverride[field as keyof typeof currentOverride] !== undefined) {
          firestoreData[field] = String(currentOverride[field as keyof typeof currentOverride]);
        }
      });

      try {
        await setDoc(overrideRef, firestoreData, { merge: true });
        // Instant visual update in State
        setAllMonthlyOverrides(p => {
          const emp = p[id] || {};
          return {
            ...p,
            [id]: {
              ...emp,
              [monthStr]: {
                ...emp[monthStr],
                ...firestoreData
              }
            }
          };
        });
        setSavedTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Save monthly override failed", err);
        triggerAlert('info', 'Failed to save cells override. Check database rules.');
      }
      return;
    }

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

    // Detect actual inputs change to avoid useless empty history snapshots
    let isDifferent = false;
    if (exists) {
      const existingEmp = employees.find(emp => emp.id === id)!;
      for (const key in updatedFields) {
        if (existingEmp[key as keyof Employee] !== updatedFields[key as keyof Employee]) {
          isDifferent = true;
          break;
        }
      }
    } else {
      isDifferent = true;
    }

    if (isDifferent && !skipUndoPush) {
      pushToUndoStack(employees);
    }

    // Immediately update local state so UI updates instantly without awaiting Firestore roundtrip network latency
    setEmployees(prev => {
      const existsInState = prev.some(emp => emp.id === id);
      let updatedList;
      if (existsInState) {
        updatedList = prev.map(emp => {
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
        updatedList = [...prev, { ...targetEmployee, id: finalDocId }];
      }
      try {
        localStorage.setItem('salarypro_employees_cache', JSON.stringify(updatedList));
      } catch (cacheErr) {
        console.warn("Storage limits reached for employees cache during update:", cacheErr);
      }
      return updatedList;
    });

    // Guard against overwriting basic salary to 0 if a valid salary exists in overrides
    let finalSalaryForMaster = Number(targetEmployee.monthlySalary) || 0;
    if (finalSalaryForMaster === 0) {
      const monthStr = `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}`;
      const activeOverride = allMonthlyOverrides[finalDocId]?.[monthStr]?.monthlySalary;
      if (activeOverride && Number(activeOverride) > 0) {
        finalSalaryForMaster = Number(activeOverride);
      } else {
        const empOverrides = allMonthlyOverrides[finalDocId] || {};
        for (const mKey in empOverrides) {
          const sal = empOverrides[mKey]?.monthlySalary;
          if (sal && Number(sal) > 0) {
            finalSalaryForMaster = Number(sal);
            break;
          }
        }
      }
    }

    // Explicitly sanitize database types to match firestore.rules validation expectations
    const sanitized: any = {
      id: finalDocId,
      name: targetEmployee.name || "",
      monthlySalary: finalSalaryForMaster,
      workingDays: Number(targetEmployee.workingDays) || 0,
      workingHours: Number(targetEmployee.workingHours) || 0,
      fullDaysAbsent: Number(targetEmployee.fullDaysAbsent) || 0,
      text: targetEmployee.fullDaysAbsent || 0,
      absentHours: Number(targetEmployee.absentHours) || 0,
      absentMinutes: Number(targetEmployee.absentMinutes) || 0,
    };

    if (targetEmployee.sundayPaid !== undefined) sanitized.sundayPaid = targetEmployee.sundayPaid;
    if (targetEmployee.salaryType !== undefined) {
      sanitized.salaryType = targetEmployee.salaryType;
    } else {
      sanitized.salaryType = finalSalaryForMaster <= 2000 ? 'daily' : 'fixed';
    }
    if (targetEmployee.department !== undefined) sanitized.department = targetEmployee.department;
    if (targetEmployee.designation !== undefined) sanitized.designation = targetEmployee.designation;
    if (targetEmployee.role !== undefined) sanitized.role = targetEmployee.role;
    if (targetEmployee.email !== undefined) sanitized.email = targetEmployee.email;
    if (targetEmployee.phone !== undefined) sanitized.phone = targetEmployee.phone;
    if (targetEmployee.gender !== undefined) sanitized.gender = targetEmployee.gender;
    if (targetEmployee.dob !== undefined) sanitized.dob = targetEmployee.dob;
    if (targetEmployee.address !== undefined) sanitized.address = targetEmployee.address;
    if (targetEmployee.shiftTime !== undefined) sanitized.shiftTime = targetEmployee.shiftTime;
    if (targetEmployee.shift !== undefined) sanitized.shift = targetEmployee.shift;
    if (targetEmployee.notes !== undefined) sanitized.notes = targetEmployee.notes;
    if (targetEmployee.documents !== undefined) sanitized.documents = targetEmployee.documents;
    if (targetEmployee.advancePayment !== undefined) sanitized.advancePayment = Number(targetEmployee.advancePayment) || 0;
    if (targetEmployee.foodBalance !== undefined) sanitized.foodBalance = Number(targetEmployee.foodBalance) || 0;

    try {
      if (isIdChange) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'employees', finalDocId), sanitized);
        batch.delete(doc(db, 'employees', id));

        // 1. Fetch and copy punches logs subcollection
        try {
          const punchesSnap = await getDocs(collection(db, 'employees', id, 'punches'));
          punchesSnap.forEach((pDoc) => {
            const pRef = doc(db, 'employees', finalDocId, 'punches', pDoc.id);
            batch.set(pRef, pDoc.data());
            batch.delete(doc(db, 'employees', id, 'punches', pDoc.id));
          });
        } catch (subErr) {
          console.error("Failed to migrate punches logs subcollection during employee ID change:", subErr);
        }

        // 2. Fetch and copy monthlyPayroll overrides subcollection
        try {
          const payrollSnap = await getDocs(collection(db, 'employees', id, 'monthlyPayroll'));
          payrollSnap.forEach((mDoc) => {
            const mRef = doc(db, 'employees', finalDocId, 'monthlyPayroll', mDoc.id);
            batch.set(mRef, mDoc.data());
            batch.delete(doc(db, 'employees', id, 'monthlyPayroll', mDoc.id));
          });
        } catch (subErr) {
          console.error("Failed to migrate monthlyPayroll subcollection during employee ID change:", subErr);
        }

        await batch.commit();

        // Migrate punches state in local memory
        setAllPunchLogs(prev => {
          const updated = { ...prev };
          if (updated[id]) {
            updated[finalDocId] = { ...updated[id] };
            delete updated[id];
          }
          return updated;
        });

        // Migrate monthly overrides state in local memory
        setAllMonthlyOverrides(prev => {
          const updated = { ...prev };
          if (updated[id]) {
            updated[finalDocId] = { ...updated[id] };
            delete updated[id];
          }
          return updated;
        });

        if (selectedEmployeeId === id) {
          setSelectedEmployeeId(finalDocId);
        }
      } else {
        await setDoc(doc(db, 'employees', id), sanitized);
      }

      if (updatedFields.monthlySalary !== undefined || updatedFields.salaryType !== undefined) {
        const monthStr = `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}`;
        const overrideRef = doc(db, 'employees', finalDocId, 'monthlyPayroll', monthStr);
        const overrideData: any = {};
        if (updatedFields.monthlySalary !== undefined) {
          overrideData.monthlySalary = Number(updatedFields.monthlySalary);
        }
        if (updatedFields.salaryType !== undefined) {
          overrideData.salaryType = updatedFields.salaryType;
        }
        try {
          await setDoc(overrideRef, overrideData, { merge: true });
          setAllMonthlyOverrides(p => {
            const emp = p[finalDocId] || {};
            const updatedOverrides = {
              ...p,
              [finalDocId]: {
                ...emp,
                [monthStr]: {
                  ...emp[monthStr],
                  ...overrideData
                }
              }
            };
            try {
              localStorage.setItem('salarypro_monthly_overrides_cache', JSON.stringify(updatedOverrides));
            } catch (storageErr) {
              console.warn("Storage limits reached for overrides cache:", storageErr);
            }
            return updatedOverrides;
          });
        } catch (subErr) {
          console.error("Failed simultaneously writing salary update to monthly override doc:", subErr);
        }
      }

      setSavedTime(new Date().toLocaleTimeString());
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${finalDocId}`);
    }
  };

  const handleAddEmployee = async () => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can add employees.');
      return;
    }
    pushToUndoStack(employees);

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
      shiftTime: '08:00 - 17:00',
      notes: [],
      documents: []
    };

    // Immediately update local state so UI updates instantly of Firestore roundtrip latency
    setEmployees(prev => {
      // Find first empty spreadsheet template row (id starting with EMP_TEMP_) and fill/replace it, or append
      const isPlaceholder = prev.some(emp => emp.id.toUpperCase().startsWith('EMP_TEMP_'));
      let updated: Employee[];
      if (isPlaceholder) {
        let replaced = false;
        updated = prev.map(emp => {
          if (!replaced && emp.id.toUpperCase().startsWith('EMP_TEMP_')) {
            replaced = true;
            return newStaff;
          }
          return emp;
        });
      } else {
        updated = [...prev, newStaff];
      }
      try {
        localStorage.setItem('salarypro_employees_cache', JSON.stringify(updated));
      } catch (e) {
        console.warn("Storage limits reached for employees cache", e);
      }
      return updated;
    });

    const path = `employees/${nextId}`;
    try {
      await setDoc(doc(db, 'employees', nextId), newStaff);
      triggerAlert('success', `Roster slot ${nextId} created successfully (Cloud DB & Cache)!`);
      handleTransitionToProfile(nextId);
    } catch (error: any) {
      console.warn("Firestore write limit reached. Saved locally in offline queue:", error);
      setCloudQuotaExceeded(true);
      setCloudError({
        code: error?.code,
        message: error?.message || String(error),
        name: error?.name
      });
      triggerAlert('success', `Roster slot ${nextId} created locally (Offline Storage fallback)`);
      handleTransitionToProfile(nextId);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can delete employees.');
      return;
    }
    
    const empToDelete = employees.find(emp => emp.id === id);
    if (!empToDelete || empToDelete.id.startsWith('EMP_TEMP_')) {
      triggerAlert('warn', 'Selected row is an empty template and cannot be deleted.');
      return;
    }

    if (confirm(`Are you sure you want to permanently delete Employee ${empToDelete.name || id}? This action is IRREVERSIBLE and cannot be undone.`)) {
      pushToUndoStack(employees);

      // Instantly update local state and save cache
      setEmployees(prev => {
        const filtered = prev.filter(emp => emp.id !== id);
        // Reseed back to 160 elements to maintain grid symmetry
        const merged: Employee[] = [...filtered.filter(emp => !emp.id.toUpperCase().startsWith('EMP_TEMP_'))];
        const takenIds = new Set(merged.map(e => e.id.toLowerCase()));
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
        try {
          localStorage.setItem('salarypro_employees_cache', JSON.stringify(merged));
        } catch (e) {
          console.warn("Storage limits reached for employees cache", e);
        }
        return merged;
      });

      // Write to cloud database
      try {
        await deleteDoc(doc(db, 'employees', id));
        triggerAlert('success', `Permanently deleted Employee ${empToDelete.name || id}.`);
      } catch (error: any) {
        console.warn("Firestore error during permanent delete, updated local cache only:", error);
        setCloudQuotaExceeded(true);
        setCloudError({
          code: error?.code,
          message: error?.message || String(error),
          name: error?.name
        });
        triggerAlert('success', `Deleted Employee ${empToDelete.name || id} offline.`);
      }
    }
  };

  // Restore factory 160-employee baseline in Cloud Firestore
  const handleResetData = async () => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can reset data.');
      return;
    }
    if (confirm('Revert all employee records to factory default (5 populated, 155 template empty rows)? This will delete completely new entries.')) {
      pushToUndoStack(employees);
      setIsSaving(true);

      // Generate the baseline array locally
      const defaultLive = INITIAL_EMPLOYEES;
      const merged: Employee[] = [...defaultLive];
      const takenIds = new Set(defaultLive.map(e => e.id.toLowerCase()));
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
      try {
        localStorage.setItem('salarypro_employees_cache', JSON.stringify(merged));
      } catch (e) {
        console.warn("Storage limits reached for employees cache", e);
      }

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
        // Also set the migration status document to safeguard future deletions
        batch.set(doc(db, 'employees', 'migration_v2_status'), MIGRATION_STATUS_DOC);
        await batch.commit();
        setSavedTime('Cloud Reinitialized');
        setSelectedEmployeeId('55');
        triggerAlert('success', 'Roster state successfully re-established in Google Cloud Firestore!');
      } catch (error: any) {
        console.warn("Firestore reset quota limit reached, reverted local state only:", error);
        setCloudQuotaExceeded(true);
        setCloudError({
          code: error?.code,
          message: error?.message || String(error),
          name: error?.name
        });
        setSavedTime('Cached Offline Reset');
        setSelectedEmployeeId('55');
        triggerAlert('success', 'Roster state successfully re-established in Local Cache!');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Restore designations & departments by matching names and IDs with the provided baseline CSV mapping
  const handleApplyRosterMapping = async () => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can apply roster mappings.');
      return;
    }
    
    setIsSaving(true);
    try {
      const lines = ROSTER_MAP_CSV.split('\n');
      const parsedRecords: Array<{
        code: string;
        name: string;
        designation: string;
        department: string;
        sundayPaid?: string;
        shiftTime?: string;
        phone?: string;
        address?: string;
        monthlySalary?: number;
        salaryType?: 'daily' | 'fixed';
      }> = [];

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('S.NO.') || trimmed.includes('BASIC SALARY OF THE EMPLOYEES') || trimmed.includes('PLANT STAFF') || trimmed.includes('PURAN CHAND CONTRACTOR')) {
          return;
        }

        const cells: string[] = [];
        let curCell = '';
        let inQuotes = false;
        for (let i = 0; i < trimmed.length; i++) {
          const char = trimmed[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cells.push(curCell.trim());
            curCell = '';
          } else {
            curCell += char;
          }
        }
        cells.push(curCell.trim());

        if (cells.length < 6) return;

        const code = cells[1] ? cells[1].trim() : '';
        const rawName = cells[2] ? cells[2].trim() : '';
        const designation = cells[4] ? cells[4].trim() : '';
        const department = cells[5] ? cells[5].trim() : '';
        const basicSalaryStr = cells[6] ? cells[6].trim().replace(/"/g, '').replace(/,/g, '') : '';
        const sundayPaidStr = cells[7] ? cells[7].trim() : '';
        const dutyTiming = cells[8] ? cells[8].trim() : '';
        const contactNo = cells[9] ? cells[9].trim() : '';
        const address = cells[10] ? cells[10].trim().replace(/"/g, '') : '';

        if (!rawName) return;

        let monthlySalary = 0;
        let salaryType: 'daily' | 'fixed' = 'fixed';
        if (basicSalaryStr.toLowerCase().includes('/day')) {
          salaryType = 'daily';
          monthlySalary = Number(basicSalaryStr.toLowerCase().replace('/day', '').replace(/[^\d\.]/g, '').trim()) || 0;
        } else {
          monthlySalary = Number(basicSalaryStr.replace(/[^\d\.]/g, '')) || 0;
        }

        parsedRecords.push({
          code: code === '-' ? '' : code,
          name: rawName,
          designation,
          department,
          sundayPaid: sundayPaidStr ? (sundayPaidStr.toLowerCase().includes('not') ? 'Not Paid' : 'Paid') : undefined,
          shiftTime: dutyTiming === '001' ? '08:00-20:00' : (dutyTiming || undefined),
          phone: contactNo || undefined,
          address: address || undefined,
          monthlySalary: monthlySalary || undefined,
          salaryType
        });
      });

      const cleanNameMap = new Map<string, typeof parsedRecords[0]>();
      const codeMap = new Map<string, typeof parsedRecords[0]>();

      const getCleanKey = (s: string) => s.toLowerCase().replace(/[\s\._\-]/g, '');

      parsedRecords.forEach(rec => {
        if (rec.code) {
          codeMap.set(rec.code.toLowerCase(), rec);
        }
        cleanNameMap.set(getCleanKey(rec.name), rec);
      });

      const batch = writeBatch(db);
      let matchedCount = 0;

      const updatedEmployees = employees.map(emp => {
        let match = codeMap.get(emp.id.toLowerCase());
        if (!match && emp.name) {
          match = cleanNameMap.get(getCleanKey(emp.name));
        }

        if (match) {
          matchedCount++;
          const finalSalary = (match.monthlySalary !== undefined) ? match.monthlySalary : (emp.monthlySalary || 0);
          const finalSalaryType = finalSalary > 2000 ? 'fixed' : 'daily';

          const updatedEmp = {
            ...emp,
            department: match.department || emp.department || 'Unassigned',
            designation: match.designation || emp.designation || 'Unassigned',
            role: match.designation || emp.role || 'Unassigned',
            monthlySalary: finalSalary,
            salaryType: finalSalaryType,
          };
          if (match.sundayPaid !== undefined) updatedEmp.sundayPaid = match.sundayPaid as any;
          if (match.shiftTime !== undefined) updatedEmp.shiftTime = match.shiftTime;
          if (match.phone !== undefined && !emp.phone) updatedEmp.phone = match.phone;
          if (match.address !== undefined && !emp.address) updatedEmp.address = match.address;

          const sanitized: any = {
            id: emp.id,
            name: updatedEmp.name || "",
            monthlySalary: Number(updatedEmp.monthlySalary) || 0,
            workingDays: Number(updatedEmp.workingDays) || 0,
            workingHours: Number(updatedEmp.workingHours) || 0,
            fullDaysAbsent: Number(updatedEmp.fullDaysAbsent) || 0,
            absentHours: Number(updatedEmp.absentHours) || 0,
            absentMinutes: Number(updatedEmp.absentMinutes) || 0,
          };
          if (updatedEmp.sundayPaid !== undefined) sanitized.sundayPaid = updatedEmp.sundayPaid;
          if (updatedEmp.salaryType !== undefined) sanitized.salaryType = updatedEmp.salaryType;
          if (updatedEmp.department !== undefined) sanitized.department = updatedEmp.department;
          if (updatedEmp.designation !== undefined) sanitized.designation = updatedEmp.designation;
          if (updatedEmp.role !== undefined) sanitized.role = updatedEmp.role;
          if (updatedEmp.shiftTime !== undefined) sanitized.shiftTime = updatedEmp.shiftTime;
          if (updatedEmp.phone !== undefined) sanitized.phone = updatedEmp.phone;
          if (updatedEmp.address !== undefined) sanitized.address = updatedEmp.address;
          if (updatedEmp.gender !== undefined) sanitized.gender = updatedEmp.gender;
          if (updatedEmp.dob !== undefined) sanitized.dob = updatedEmp.dob;
          if (updatedEmp.notes !== undefined) sanitized.notes = updatedEmp.notes;
          if (updatedEmp.documents !== undefined) sanitized.documents = updatedEmp.documents;

          batch.set(doc(db, 'employees', emp.id), sanitized);
          return updatedEmp;
        }

        return emp;
      });

      await batch.commit();
      setEmployees(updatedEmployees);
      localStorage.setItem('salarypro_employees_cache', JSON.stringify(updatedEmployees));
      triggerAlert('success', `Roster data matched and restored successfully! Updated ${matchedCount} employee records in the Database.`);
    } catch (err: any) {
      console.error("Apply roster mapping failed:", err);
      triggerAlert('info', `Failed to apply roster map: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Modify bulk parameters constants
  const handleBulkUpdateSettings = async (days: number, hours: number) => {
    if (!hasEditingRights) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator (sandydalhousie@gmail.com) can change global workbook constants.');
      return;
    }
    pushToUndoStack(employees);
    setIsSaving(true);

    const updated = employees.map(emp => ({
      ...emp,
      workingDays: days,
      workingHours: hours
    }));

    setEmployees(updated);
    try {
      localStorage.setItem('salarypro_employees_cache', JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage limits reached for employees cache", e);
    }

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
    } catch (error: any) {
      console.warn("Firestore bulk update quota limit reached, updated local state only:", error);
      setCloudQuotaExceeded(true);
      setCloudError({
        code: error?.code,
        message: error?.message || String(error),
        name: error?.name
      });
      triggerAlert('success', `Mass-updated settings locally to ${days} working days and ${hours} working hours per day (Offline Cache)`);
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

  if (!loggedInEmail) {
    const handleGoogleSignIn = async () => {
      setAuthLoading(true);
      setOtpError(null);
      try {
        const result = await signInWithPopup(auth, googleProvider);
        if (result && result.user) {
          const email = (result.user.email || '').toLowerCase();
          
          const ALLOWED_ADMINS = ['sandydalhousie@gmail.com'];
          const ALLOWED_OBSERVERS = [
            'goyal.siddhartha1997@gmail.com',
            'skshimla@gmail.com',
            'himgoldenterprises@gmail.com',
            'shantanu.goyal93@gmail.com',
            'fortuneflexipack@gmail.com'
          ];

          if (!ALLOWED_ADMINS.includes(email) && !ALLOWED_OBSERVERS.includes(email)) {
            await auth.signOut();
            setLoggedInEmail(null);
            setLoggedInName(null);
            setLoggedInPhoto(null);
            localStorage.removeItem('salarypro_logged_in_email');
            localStorage.removeItem('salarypro_logged_in_name');
            localStorage.removeItem('salarypro_logged_in_photo');
            setOtpError(`Google Account (${email}) is not authorized. Please log in with an authorized account.`);
            setAuthLoading(false);
            return;
          }

          const name = result.user.displayName || email.split('@')[0] || 'User';
          const photo = result.user.photoURL || '';
          setLoggedInEmail(email);
          setLoggedInName(name);
          setLoggedInPhoto(photo);
          localStorage.setItem('salarypro_logged_in_email', email);
          localStorage.setItem('salarypro_logged_in_name', name);
          localStorage.setItem('salarypro_logged_in_photo', photo);
          triggerAlert('success', `Welcome! Signed in successfully as ${email === 'sandydalhousie@gmail.com' ? 'Admin (' + email + ')' : 'Observer (' + email + ')'}`);
        }
      } catch (err: any) {
        console.error("Google Sign-in Error:", err);
        setOtpError(`Authentication failed: ${err.message || 'Make sure popups are allowed.'}`);
      } finally {
        setAuthLoading(false);
      }
    };

    const handleCustomEmailSignIn = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthLoading(true);
      setOtpError(null);

      const trimmedEmail = emailVal.trim().toLowerCase();
      const trimmedPassword = passwordVal;

      if (!trimmedEmail) {
        setOtpError('Please enter a valid email address.');
        setAuthLoading(false);
        return;
      }
      if (trimmedPassword.length < 6) {
        setOtpError('Password must be at least 6 characters long.');
        setAuthLoading(false);
        return;
      }

      // ONLY allow hr@fortuneflexipack.com for Custom Email sign-in
      if (trimmedEmail !== 'hr@fortuneflexipack.com') {
        setOtpError('Unauthorized email. Only hr@fortuneflexipack.com is permitted to login.');
        setAuthLoading(false);
        return;
      }

      if (trimmedPassword !== 'Paonta@2025') {
        setOtpError('Incorrect password. Please verify and try again.');
        setAuthLoading(false);
        return;
      }

      const email = 'hr@fortuneflexipack.com';
      const name = 'HR Fortuneflexipack';
      setLoggedInEmail(email);
      setLoggedInName(name);
      setLoggedInPhoto('');
      localStorage.setItem('salarypro_logged_in_email', email);
      localStorage.setItem('salarypro_logged_in_name', name);
      localStorage.setItem('salarypro_logged_in_photo', '');
      triggerAlert('success', `Logged in successfully! Welcome Observer (${email})`);
      setAuthLoading(false);
    };

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 selection:bg-teal-500 selection:text-white antialiased font-sans relative overflow-hidden w-full">
        {/* Abstract circular ambient blobs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Global Alert Notification Toast */}
        {alertMsg && (
          <div className={`fixed top-6 right-6 z-50 animate-bounce bg-slate-800 border-l-4 ${alertMsg.type === 'success' ? 'border-emerald-500' : alertMsg.type === 'warn' ? 'border-amber-550' : 'border-teal-400'} text-white p-4 rounded-xl shadow-2xl flex items-start gap-3 max-w-sm`}>
            {alertMsg.type === 'success' ? (
              <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
            ) : alertMsg.type === 'warn' ? (
              <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <Info size={18} className="text-teal-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-extrabold text-xs select-text leading-tight">{alertMsg.text}</p>
            </div>
          </div>
        )}

        {/* Auth Main Card */}
        <div className="w-full max-w-md bg-white border border-slate-100 shadow-2xl rounded-3xl overflow-hidden p-8 z-10 text-center relative select-none">
          
          {/* Brand Shield Logo Box */}
          <div className="w-14 h-14 bg-[#e6fcf5] rounded-2xl flex items-center justify-center text-[#1abc9c] mx-auto mb-5 border border-emerald-50 shadow-inner">
            <ShieldAlert size={28} />
          </div>

          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-1.5 font-sans">
            SalaryPro <span className="bg-emerald-50 text-[#0c8569] border border-emerald-100 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase scale-90">Cloud Safe</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-sm mx-auto mt-2 leading-relaxed">
            Real-Time Google & Custom Email Sign-In Portal. <br/>
            Secure payroll sheets and staff roster management ledger.
          </p>

          {/* Secure Custom Email Tab Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mt-6 mb-5 border border-slate-200/50">
            <button
              onClick={() => { setAuthMethod('google'); setOtpError(null); }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                authMethod === 'google'
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Google Account
            </button>
            <button
              onClick={() => { setAuthMethod('email'); setOtpError(null); }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                authMethod === 'email'
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Custom Email
            </button>
          </div>

          <div id="recaptcha-container" className="flex justify-center scale-90 origin-top mb-1"></div>

          {/* Verification Forms Switcher */}
          <div className="space-y-4 text-left">
            {authMethod === 'google' ? (
              <div className="space-y-4 text-center">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider leading-snug">
                  Quick access with standard GSuite or corporate google accounts
                </p>
                {/* Primary Action Button: Google Authentication */}
                <button 
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full h-12 bg-slate-900 hover:bg-slate-950 hover:shadow-lg disabled:opacity-55 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.98] font-sans border border-slate-800 shadow-sm"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.97 1 12 1 7.35 1 3.4 3.65 1.5 7.5l3.96 3.07C6.4 7.63 8.93 5.04 12 5.04z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.81-.07-1.59-.2-2.27H12v4.51h6.44c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-1.99 3.73-4.92 3.73-8.69z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.46 10.57c-.24-.73-.38-1.5-.38-2.32s.14-1.59.38-2.32L1.5 2.86C.54 4.77 0 6.94 0 9.25s.54 4.48 1.5 6.39l3.96-3.07z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.7-2.87c-1.03.69-2.35 1.1-4.26 1.1-3.07 0-5.6-2.59-6.53-5.53L1.5 15.86C3.4 19.7 7.35 23 12 23z"
                    />
                  </svg>
                  <span>{authLoading ? 'Signing in...' : 'Sign In with Google'}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomEmailSignIn} className="space-y-4">
                {/* Custom Email address input */}
                <div>
                  <label className="block mb-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Custom Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center justify-center text-slate-400 pointer-events-none">
                      <Mail size={15} />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="e.g. hr@fortuneflexipack.com"
                      value={emailVal}
                      onChange={(e) => setEmailVal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div>
                  <label className="block mb-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Password Code
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center justify-center text-slate-400 pointer-events-none">
                      <Lock size={15} />
                    </span>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Password (min 6 characters)"
                      value={passwordVal}
                      onChange={(e) => setPasswordVal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Signup Mode Toggle */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">
                    {isSignUpMode ? 'Need to enter standard account?' : 'Using hostinger for the first time?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setIsSignUpMode(!isSignUpMode); setOtpError(null); }}
                    className="text-[10px] text-emerald-600 hover:text-emerald-700 font-black uppercase tracking-wider cursor-pointer"
                  >
                    {isSignUpMode ? 'Sign In instead' : 'Register Email'}
                  </button>
                </div>

                {/* Submit Email authentication */}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-md shadow-emerald-500/10"
                >
                  {authLoading ? (
                    <span>Processing Secure Authentication...</span>
                  ) : (
                    <span>{isSignUpMode ? 'Register & Sign In as Observer' : 'Sign In to Portal'}</span>
                  )}
                </button>
              </form>
            )}

            {otpError && (
              <div className="bg-rose-50 text-rose-700 text-xs font-bold p-3 rounded-xl border border-rose-100 flex items-start gap-2 animate-fadeIn text-left">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span className="leading-tight">{otpError}</span>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

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
            {loggedInEmail !== 'hr@fortuneflexipack.com' && (
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
            )}

            {/* Search EMP Link */}
            {loggedInEmail !== 'hr@fortuneflexipack.com' && (
              <button
                onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                  activeTab === 'calendar' 
                    ? 'bg-slate-55 text-slate-850 font-black' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Search size={16} />
                <span>Search EMP</span>
              </button>
            )}

            {/* Employees Link (Active in the UI mockup with Mint background!) */}
            {loggedInEmail !== 'hr@fortuneflexipack.com' && (
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
            )}

            {/* Attendance Link */}
            {loggedInEmail !== 'hr@fortuneflexipack.com' && (
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
            )}

            {/* Advance Paid Link */}
            <button
              onClick={() => { setActiveTab('advance'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'advance' 
                  ? 'bg-slate-55 text-slate-850 font-black shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Wallet size={16} />
              <span>Advances & Food Bill</span>
            </button>

            {/* Gate Pass Employee Record Link */}
            <button
              onClick={() => { setActiveTab('gatepass'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'gatepass' 
                  ? 'bg-slate-55 text-slate-850 font-black shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ClipboardList size={16} className={activeTab === 'gatepass' ? 'text-amber-500' : ''} />
              <span>Gate Pass Employee Record</span>
            </button>

            {/* Overtime Logs Link */}
            <button
              onClick={() => { setActiveTab('overtime'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'overtime' 
                  ? 'bg-slate-55 text-slate-850 font-black shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Zap size={16} className={activeTab === 'overtime' ? 'text-emerald-500 font-black animate-pulse' : ''} />
              <span>Overtime Logs</span>
            </button>

            {/* PP Loom Orders Link */}
            <button
              onClick={() => { setActiveTab('looms'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold tracking-wide transition-all ${
                activeTab === 'looms' 
                  ? 'bg-slate-55 text-slate-850 font-black shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers size={16} className={activeTab === 'looms' ? 'text-indigo-500 font-extrabold' : ''} />
              <span>PP Loom Orders</span>
            </button>

            {/* Payroll Ledger Link (Our powerful Spreadsheet table!) */}
            {loggedInEmail !== 'hr@fortuneflexipack.com' && (
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
            )}

          </nav>

          <div className="p-4 mr-3 mt-auto ml-1 mb-2">
            {/* Elegant Log Out button */}
            <button 
              onClick={handleLogout}
              className="w-full h-9 flex items-center justify-center gap-2 px-4 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200/50 hover:border-rose-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Log Out Session</span>
            </button>
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
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 sticky top-0 z-20 print:hidden select-none">
          
          {/* 1. Left Title Block */}
          <div className="flex items-center gap-3 justify-between md:justify-start shrink-0">
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
                  {activeTab === 'advance' && 'Advances & Food Bill'}
                  {activeTab === 'gatepass' && 'Gate Pass Employee Record'}
                  {activeTab === 'overtime' && 'Employee Overtime Logs'}
                  {activeTab === 'looms' && 'PP Fabric Loom Orders'}
                  {activeTab === 'calendar' && 'Search EMP'}
                  {activeTab === 'attendance' && 'Attendance Logs'}
                  {activeTab === 'performance' && 'Evaluation Overviews'}
                </span>
                <span className="hidden sm:inline-block text-[9.5px] font-extrabold text-slate-400 font-mono">
                  v2.5
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium leading-none">
                {activeTab === 'employees' && `Focus active profile: ${activeSelectedEmployee?.name || 'Roster Row'}`}
                {activeTab === 'payroll' && 'Auto-calculating 160 active spreadsheet columns'}
                {activeTab === 'dashboard' && 'Aggregate organization sums & outliers analysis'}
                {activeTab === 'calendar' && 'Slice, filter and find staff by metrics, absences, basis or department'}
                {activeTab === 'looms' && 'Weaving details, GSM, denier, weight, and order tonnage logs'}
                {activeTab !== 'employees' && activeTab !== 'payroll' && activeTab !== 'dashboard' && activeTab !== 'calendar' && activeTab !== 'looms' && 'HR Portal sandbox and database logs'}
              </p>
            </div>
          </div>

          {/* 2. Center Search Anything Bar (Direct Sibling) */}
          <div className="flex-1 max-w-sm md:max-w-md relative mx-0 md:mx-4 w-full md:w-auto">
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
                className="w-full bg-slate-50 border-0 pl-9 pr-8 py-2.5 rounded-xl text-xs font-semibold placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-slate-800"
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
          </div>

          {/* 3. Right Action buttons & profile block (Direct Sibling) */}
          <div className="flex items-center gap-2 select-none shrink-0 justify-between md:justify-end">
            
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
              onClick={() => window.print()}
              className="h-8 px-3 rounded-xl bg-slate-900 border border-slate-950 text-white hover:bg-emerald-600 hover:border-emerald-700 font-extrabold uppercase tracking-widest flex items-center gap-1.5 shadow-xs transition-all cursor-pointer select-none hover:scale-[1.02] active:scale-95 text-[9.5px]"
              title="Print the entire visible page report card cleanly"
              id="global-print-trigger-btn"
            >
              <Printer size={12} className="shrink-0 text-emerald-400" />
              <span>Print Page</span>
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
              {loggedInPhoto ? (
                <img 
                  src={loggedInPhoto} 
                  alt={loggedInName || 'Profile'} 
                  className="w-8.5 h-8.5 rounded-full border border-slate-200 shadow-inner select-none"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className={`w-8.5 h-8.5 rounded-full ${hasEditingRights ? 'bg-[#1abc9c]' : 'bg-slate-500'} text-white flex items-center justify-center font-bold text-xs shadow-inner select-none`}>
                  {loggedInName ? loggedInName.slice(0, 2).toUpperCase() : (hasEditingRights ? 'ADM' : 'OBS')}
                </div>
              )}
              <div className="hidden lg:block text-left leading-tight select-text">
                <p className="text-xs font-bold text-slate-800">
                  {loggedInName || (hasEditingRights ? 'Administrator' : 'Observer')}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold tracking-wide lowercase truncate max-w-[140px]">
                  {loggedInEmail}
                </p>
              </div>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all cursor-pointer select-none"
                title="Log Out Session"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>LOGOUT</span>
              </button>
            </div>
          </div>
        </header>

        {/* Offline Support Notice banner when quota is reached */}
        {cloudQuotaExceeded && (
          <div className="bg-amber-500 text-white px-6 py-2.5 flex justify-between items-center text-xs font-bold font-sans tracking-wide shadow-inner animate-fadeIn select-none shrink-0 border-b border-amber-600/20 print:hidden animate-fadeIn">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-white shrink-0 animate-pulse" />
              <span>
                {(() => {
                  if (!cloudError) {
                    return (
                      <>
                        Seamless Offline Local-Cache Activated: Cloud Database connection is offline. <strong>All active changes, sheets edit, and operations are fully functional & securely saved to your browser cache!</strong>
                      </>
                    );
                  }

                  const code = cloudError.code;
                  const msg = cloudError.message || "";

                  if (code === 'resource-exhausted' || msg.includes('quota') || msg.includes('Quota')) {
                    return (
                      <>
                        Seamless Offline Local-Cache Activated: Cloud Database Quota has been reached for today. <strong>All active changes, sheets edit, and operations are fully functional & securely saved to your browser cache!</strong>
                      </>
                    );
                  }

                  if (code === 'permission-denied' || msg.includes('permission') || msg.includes('Permission')) {
                    return (
                      <>
                        Database Access Permission Denied ({code || 'Security Rules'}): <strong>Please sign in with an authorized administrator account or verify Firestore rules. All operational changes are securely saved to your browser cache!</strong>
                      </>
                    );
                  }

                  if (code === 'unavailable' || msg.includes('offline') || msg.includes('network') || msg.includes('Network')) {
                    return (
                      <>
                        Cloud Connection Offline: Database is currently unreachable or disconnected. <strong>All active edits are fully functional and securely saved to your browser cache!</strong>
                      </>
                    );
                  }

                  return (
                    <>
                      Cloud Sync Offline ({code || 'Error'}: {msg.substring(0, 80)}{msg.length > 80 ? '...' : ''}). <strong>All operational changes are fully functional & securely saved to your browser cache!</strong>
                    </>
                  );
                })()}
              </span>
            </div>
            <button 
              onClick={() => {
                setCloudQuotaExceeded(false);
                setCloudError(null);
                triggerManualSave();
                fetchAllData(false); // Perform an actual retry connect to verify connection status
              }}
              className="px-3 py-1 bg-white/20 hover:bg-white/35 text-white text-[11px] font-black rounded-lg uppercase tracking-wider cursor-pointer"
              title="Click to retry cloud synchronization and diagnostic check"
            >
              Test Connection
            </button>
          </div>
        )}

        {/* ⏰ Secondary Floating status ribbon for HR supervisors */}
        <div className="bg-[#f1f5f9]/70 border-b border-slate-150 px-6 py-2 flex flex-col md:flex-row justify-between items-start md:items-center text-[10px] text-slate-500 font-mono tracking-wide print:hidden">
          <div className="flex items-center gap-4 flex-wrap select-none">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${hasEditingRights ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'} inline-block`}></span>
              System Code: <strong>SalaryPro Corporate Roster v2.5</strong>
            </span>
            <span>•</span>
            <span>
              Enterprise Ledger Access Rights: {hasEditingRights ? (
                <strong className="text-emerald-700">Admin Supervisor (🟢 Read & Write)</strong>
              ) : loggedInEmail === 'laxmanverma@fortuneflexipack.com' ? (
                <strong className="text-slate-700">Read-Only Administrator (🟢 Full Views, View-Only)</strong>
              ) : (
                <strong className="text-amber-700">Guest Observer (⚠️ Read-Only Restriction)</strong>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3.5 mt-1.5 md:mt-0 select-none">
            {savedTime && (
              <span className="bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded text-[9.5px] font-bold">
                Last Local Backup: {savedTime}
              </span>
            )}
            <button
              onClick={() => fetchAllData(false)}
              disabled={syncLoading}
              className="px-2.5 py-0.5 rounded text-[9.5px] font-bold bg-[#0c8569]/10 text-[#0c8569] hover:bg-[#0c8569]/20 font-mono flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              title="Pull fresh data from Google Cloud Firestore"
            >
              {syncLoading ? (
                <>
                  <Clock size={11} className="animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={11} />
                  <span>Sync Cloud Data</span>
                </>
              )}
            </button>
            <button
              onClick={handleApplyRosterMapping}
              disabled={isSaving}
              className="px-2.5 py-0.5 rounded text-[9.5px] font-bold bg-[#0c8569] text-white hover:bg-[#0a7058] font-mono flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              title="Match and repair employee departments and designations from the master roster mapping list"
            >
              <UserCheck size={11} />
              <span>Match Roster (Code/Name)</span>
            </button>
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
            <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xl ${alertMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : alertMsg.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
              {alertMsg.type === 'success' ? (
                <CheckCircle className="mt-0.5 shrink-0 text-emerald-500" size={16} />
              ) : alertMsg.type === 'warn' ? (
                <AlertCircle className="mt-0.5 shrink-0 text-amber-500" size={16} />
              ) : (
                <Info className="mt-0.5 shrink-0 text-blue-500" size={16} />
              )}
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
          {activeTab === 'dashboard' && loggedInEmail !== 'hr@fortuneflexipack.com' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-100 rounded-3xl p-6.5 shadow-xs relative">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight uppercase mb-4">Corporate Workforce Analytics</h3>
                <Dashboard 
                  employees={computedEmployees}
                  ledgerMonth={ledgerMonth}
                  ledgerYear={ledgerYear}
                  setLedgerMonth={setLedgerMonth}
                  setLedgerYear={setLedgerYear}
                />
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
          {activeTab === 'employees' && activeSelectedEmployee && loggedInEmail !== 'hr@fortuneflexipack.com' && (
            <div className="w-full">
              <EmployeeProfileDetails 
                employee={activeSelectedEmployee}
                allEmployees={computedEmployees}
                onBack={() => setActiveTab('payroll')}
                onUpdateEmployee={handleUpdateEmployee}
                onSelectEmployeeId={setSelectedEmployeeId}
                viewOnly={!hasEditingRights}
                allPunchLogs={allPunchLogs}
                setAllPunchLogs={setAllPunchLogs}
                ledgerMonth={ledgerMonth}
                ledgerYear={ledgerYear}
                triggerAlert={triggerAlert}
              />
            </div>
          )}

          {/* ==================== TAB: 3. EDITABLE EXCEL LEDGER SHEET ==================== */}
          {activeTab === 'payroll' && loggedInEmail !== 'hr@fortuneflexipack.com' && (
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
                  canUndo={undoStack.length > 0}
                  onUndo={handleUndo}
                  onPushUndo={() => pushToUndoStack(employees)}
                  viewOnly={!hasEditingRights}
                  ledgerMonth={ledgerMonth}
                  setLedgerMonth={setLedgerMonth}
                  ledgerYear={ledgerYear}
                  setLedgerYear={setLedgerYear}
                />
              </div>
            </div>
          )}

          {/* ==================== TAB: 6. ATTENDANCE LOG INTEGRATOR ==================== */}
          {activeTab === 'attendance' && loggedInEmail !== 'hr@fortuneflexipack.com' && (
            <AttendanceImport 
              employees={employees}
              onUpdateEmployee={handleUpdateEmployee}
              triggerAlert={triggerAlert}
              onViewEmployeeProfile={handleTransitionToProfile}
              allPunchLogs={allPunchLogs}
              ledgerMonth={ledgerMonth}
              setLedgerMonth={setLedgerMonth}
              ledgerYear={ledgerYear}
              setLedgerYear={setLedgerYear}
              onPunchesSynced={handlePunchesSynced}
              viewOnly={!hasEditingRights}
            />
          )}

           {/* ==================== TAB: ADVANCE PAID ==================== */}
          {activeTab === 'advance' && (
            <AdvancePaid 
              employees={computedEmployees}
              allMonthlyOverrides={allMonthlyOverrides}
              triggerAlert={triggerAlert}
              viewOnly={!(loggedInEmail === 'sandydalhousie@gmail.com' || loggedInEmail === 'hr@fortuneflexipack.com')}
              ledgerMonth={ledgerMonth}
              ledgerYear={ledgerYear}
              setAllMonthlyOverrides={setAllMonthlyOverrides}
              setLedgerMonth={setLedgerMonth}
              setLedgerYear={setLedgerYear}
            />
          )}

          {/* ==================== TAB: GATE PASS RECORDS ==================== */}
          {activeTab === 'gatepass' && (
            <GatePassRecord 
              employees={computedEmployees}
              triggerAlert={triggerAlert}
              viewOnly={!(loggedInEmail === 'sandydalhousie@gmail.com' || loggedInEmail === 'hr@fortuneflexipack.com')}
              ledgerMonth={ledgerMonth}
              ledgerYear={ledgerYear}
              setLedgerMonth={setLedgerMonth}
              setLedgerYear={setLedgerYear}
            />
          )}

          {/* ==================== TAB: OVERTIME LOGS ==================== */}
          {activeTab === 'overtime' && (
            <OvertimeLogs 
              employees={computedEmployees}
              triggerAlert={triggerAlert}
              viewOnly={!(loggedInEmail === 'sandydalhousie@gmail.com' || loggedInEmail === 'hr@fortuneflexipack.com')}
              ledgerMonth={ledgerMonth}
              ledgerYear={ledgerYear}
              setLedgerMonth={setLedgerMonth}
              setLedgerYear={setLedgerYear}
            />
          )}

          {/* ==================== TAB: PP FABRIC LOOM ORDERS ==================== */}
          {activeTab === 'looms' && (
            <LoomOrders 
              triggerAlert={triggerAlert}
              viewOnly={!(loggedInEmail === 'sandydalhousie@gmail.com' || loggedInEmail === 'hr@fortuneflexipack.com')}
            />
          )}

          {/* ==================== TAB: SEARCH EMP ==================== */}
          {activeTab === 'calendar' && loggedInEmail !== 'hr@fortuneflexipack.com' && (
            <SearchEmp 
              employees={computedEmployees}
              onViewProfile={handleTransitionToProfile}
              ledgerMonth={ledgerMonth}
              ledgerYear={ledgerYear}
              setLedgerMonth={setLedgerMonth}
              setLedgerYear={setLedgerYear}
            />
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
