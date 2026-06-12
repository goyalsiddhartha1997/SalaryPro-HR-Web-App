import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Employee } from '../types';
import { 
  Upload, 
  CheckCircle2, 
  RefreshCw, 
  ArrowRight, 
  Users, 
  Clock, 
  Play, 
  Settings2,
  ToggleLeft,
  ChevronRight,
  Search,
  Calendar,
  Eye,
  AlertCircle,
  Database,
  Trash2,
  Plus,
  Edit,
  Save,
  AlertTriangle,
  XCircle,
  Download,
  UserPlus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { isEmployeePresent } from '../data';

// Helper to filter out empty, padding or 00:00 punches to determine true physical triggers count
const getCleanPunches = (punchesList: string[]): string[] => {
  return (punchesList || []).filter(p => {
    if (!p) return false;
    const trimmed = p.trim();
    if (trimmed === '' || trimmed.startsWith('00:00')) return false;
    return true;
  });
};

export interface ShiftRules {
  prependInCutoff: string;     // e.g. "10:00"
  prependInTime: string;       // e.g. "08:00"
  morningDupStart: string;     // e.g. "07:45"
  morningDupEnd: string;       // e.g. "09:30"
  eveningDupStart: string;     // e.g. "19:00"
  eveningDupEnd: string;       // e.g. "20:30"
  lunchStart: string;          // e.g. "12:50"
  lunchEnd: string;            // e.g. "14:20"
  warningThreshold: number;    // e.g. 90
  defaultExitTime: string;     // e.g. "18:00"
}

const parseTimeToMins = (timeStr: string): number => {
  const parts = timeStr.trim().split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
};

const isTimeInRange = (mins: number, startStr: string, endStr: string): boolean => {
  const start = parseTimeToMins(startStr);
  const end = parseTimeToMins(endStr);
  if (start <= end) {
    return mins >= start && mins <= end;
  } else {
    // Overnight wraparound
    return mins >= start || mins <= end;
  }
};

// Helper to analyze actual punches against employee shift schedules to check for missing entry/exit within 90 minutes.
const getShiftWarnings = (
  punches: string[],
  shiftTime: string | undefined,
  rules: ShiftRules
): { entryWarning: string | null; exitWarning: string | null } => {
  const clean = getCleanPunches(punches);
  if (clean.length === 0) {
    return { entryWarning: null, exitWarning: null };
  }

  const actualShiftStr = shiftTime || `${rules.prependInTime} - ${rules.defaultExitTime}`;
  const parts = actualShiftStr.split('-').map(s => s.trim());
  if (parts.length !== 2) {
    return { entryWarning: null, exitWarning: null };
  }

  const parseTime = (timeStr: string): number | null => {
    const match = timeStr.match(/(\d+):(\d+)/);
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return h * 60 + m;
  };

  const shiftEntryMins = parseTime(parts[0]);
  const shiftExitMins = parseTime(parts[1]);

  if (shiftEntryMins === null || shiftExitMins === null) {
    return { entryWarning: null, exitWarning: null };
  }

  // Parse actual punches into minutes (e.g. "08:00 Arr Time" -> 480)
  // We ignore (Auto) punches when checking if the employee has any original punch on record.
  const actualMins = clean
    .filter(p => !p.toLowerCase().includes('(auto)'))
    .map(p => {
      const timePart = p.trim().split(' ')[0];
      return parseTime(timePart);
    })
    .filter((m): m is number => m !== null);

  const threshold = rules.warningThreshold || 90;

  // Check entry punch: is there any punch within ±threshold of shift entry?
  const hasEntryPunch = actualMins.some(m => {
    const diff = Math.abs(m - shiftEntryMins);
    return Math.min(diff, 1440 - diff) <= threshold;
  });
  const entryWarning = !hasEntryPunch 
    ? `employee has no entry punch at all [maybe emp came late to work]` 
    : null;

  // Check exit punch: is there any punch within ±threshold of shift exit?
  const hasExitPunch = actualMins.some(m => {
    const diff = Math.abs(m - shiftExitMins);
    return Math.min(diff, 1440 - diff) <= threshold;
  });
  const exitWarning = !hasExitPunch 
    ? `this employee has no exit punch at all [maybe emp took half day]` 
    : null;

  return { entryWarning, exitWarning };
};

// Helper to automatically self-repair common biometric punch anomalies (such as missing lunch back-in or missing checkout)
const repairPunches = (
  rawPunches: string[], 
  existingEmp?: any, 
  row?: Record<string, string>,
  rules?: ShiftRules
): { repaired: boolean, punches: string[] } => {
  const clean = getCleanPunches(rawPunches);
  if (clean.length === 0) {
    return { repaired: false, punches: rawPunches };
  }

  const defaultRules: ShiftRules = {
    prependInCutoff: '10:00',
    prependInTime: '08:00',
    morningDupStart: '07:30',
    morningDupEnd: '09:30',
    eveningDupStart: '19:00',
    eveningDupEnd: '20:30',
    lunchStart: '12:50',
    lunchEnd: '14:20',
    warningThreshold: 90,
    defaultExitTime: '18:00'
  };
  const activeRules = rules || defaultRules;

  const findRowValueLocal = (r: Record<string, string>, keywords: string[]): string => {
    for (const key of Object.keys(r)) {
      const lowerKey = key.toLowerCase();
      if (keywords.some(kw => lowerKey.includes(kw))) {
        return (r[key] || '').trim();
      }
    }
    return '';
  };

  // Helper to determine the standard exit time based on department/role and shift
  const getEffectiveShiftTime = (): string => {
    const empShift = ((existingEmp?.shift || (activeRules.prependInTime === '20:00' ? 'NIGHT' : 'DAY')) as string).toUpperCase();
    const isNightShift = empShift === 'NIGHT' || empShift.includes('NIGHT');

    // 1. Prioritize reading shift timings of that employee from the Employees section
    if (existingEmp && existingEmp.shiftTime) {
      return existingEmp.shiftTime;
    }
    
    // 2. Check department/role/row fallback if employee is not found in DB
    let dept = '';
    if (row) {
      dept = (row['Department'] || row['department'] || findRowValueLocal(row, ['dept', 'department'])).toUpperCase();
    } else if (existingEmp && existingEmp.department) {
      dept = existingEmp.department.toUpperCase();
    }
    let role = '';
    if (existingEmp && existingEmp.role) {
      role = existingEmp.role.toUpperCase();
    } else if (row) {
      role = (row['Role'] || row['role'] || findRowValueLocal(row, ['role', 'designation'])).toUpperCase();
    }

    if (isNightShift) {
      if (dept.includes('SECURITY') || dept.includes('GUARD') || role.includes('SECURITY') || role.includes('GUARD')) {
        return '19:30 - 08:30';
      }
      return '20:00 - 08:00';
    }

    if (dept.includes('SECURITY') || dept.includes('GUARD') || role.includes('SECURITY') || role.includes('GUARD')) {
      return '08:00 - 20:00';
    }
    if (row) {
      const wHrsValue = (row['W.Hrs'] || row['w.hrs'] || row['Working Hours'] || findRowValueLocal(row, ['w.hrs', 'whrs', 'working hours', 'working_hours'])).toUpperCase();
      if (wHrsValue.includes('12:00') || wHrsValue.includes('12')) {
        return '08:00 - 20:00';
      }
    }
    if (dept.includes('ADMIN') || dept.includes('OFFICE') || dept.includes('HR') || role.includes('ADMIN') || role.includes('OFFICE') || role.includes('HR')) {
      return '08:00 - 17:00';
    }

    return `${activeRules.prependInTime} - ${activeRules.defaultExitTime}`;
  };

  const effectiveShiftTime = getEffectiveShiftTime();
  const partsShift = effectiveShiftTime.split('-').map((s: string) => s.trim());

  const empShift = ((existingEmp?.shift || (activeRules.prependInTime === '20:00' ? 'NIGHT' : 'DAY')) as string).toUpperCase();
  const isNightShift = empShift === 'NIGHT' || empShift.includes('NIGHT');

  const getRelativeMinutesForShift = (tStr: string, isNight: boolean): number => {
    const parts = tStr.trim().split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    const abs = h * 60 + m;
    if (!isNight) return abs;
    // Noon-to-noon coordinates: noon is 720, map 12:00-24:00 to 0-720 and 00:00-12:00 to 720-1440
    return abs >= 720 ? abs - 720 : abs + 720;
  };

  let shiftStartMins = isNightShift ? 480 : 8 * 60; // defaults (relative)
  let shiftExitMins = isNightShift ? 1200 : 17 * 60;
  if (partsShift.length === 2) {
    shiftStartMins = getRelativeMinutesForShift(partsShift[0], isNightShift);
    shiftExitMins = getRelativeMinutesForShift(partsShift[1], isNightShift);
  }

  const getExitTime = (): number => {
    return shiftExitMins;
  };

  // 1. Parse all clean punches with their types in relative coordinates
  let parsed = clean.map(p => {
    const parts = p.trim().split(' ');
    const timeStr = parts[0] || '';
    const label = parts.slice(1).join(' ').toUpperCase();
    
    // Check type based on label
    let type: 'IN' | 'OUT' = 'IN';
    if (label.startsWith('OUT') || label.includes('OUT') || label.includes('KELUAR') || label.includes('EXIT')) {
      type = 'OUT';
    } else if (label.startsWith('IN') || label.startsWith('ARR') || label.includes('IN') || label.includes('MASUK') || label.includes('ARR')) {
      type = 'IN';
    } else {
      type = 'IN';
    }

    return {
      timeStr,
      minutes: getRelativeMinutesForShift(timeStr, isNightShift),
      type,
      original: p
    };
  });

  // Sort chronologically using relative coordinates
  parsed.sort((a, b) => a.minutes - b.minutes);

  let isModified = false;
  const originalLength = parsed.length;

  const formatMins = (mins: number) => {
    const clamped = (mins + 1440) % 1440;
    const hrs = Math.floor(clamped / 60);
    const mn = clamped % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
  };

  // Duplicate consolidate windows in relative minutes
  const morningStartRel = Math.min(getRelativeMinutesForShift(activeRules.morningDupStart, isNightShift), shiftStartMins - 30);
  const morningEndRel = Math.max(getRelativeMinutesForShift(activeRules.morningDupEnd, isNightShift), shiftStartMins + 120);

  // Filter entry duplicates
  const morningPunches = parsed.filter(p => p.minutes >= morningStartRel && p.minutes <= morningEndRel);
  if (morningPunches.length > 1) {
    // Keep the earliest
    const earliestMorningPunch = morningPunches.reduce((earliest, current) => {
      return current.minutes < earliest.minutes ? current : earliest;
    }, morningPunches[0]);

    parsed = parsed.filter(p => {
      if (p.minutes >= morningStartRel && p.minutes <= morningEndRel) {
        return p === earliestMorningPunch;
      }
      return true;
    });
  }

  // Filter exit duplicates
  const eveningStartRel = Math.min(getRelativeMinutesForShift(activeRules.eveningDupStart, isNightShift), shiftExitMins - 60);
  const eveningEndRel = Math.max(getRelativeMinutesForShift(activeRules.eveningDupEnd, isNightShift), shiftExitMins + 90);

  const eveningPunches = parsed.filter(p => p.minutes >= eveningStartRel && p.minutes <= eveningEndRel);
  if (eveningPunches.length > 1) {
    // Keep the latest
    const latestEveningPunch = eveningPunches.reduce((latest, current) => {
      return current.minutes > latest.minutes ? current : latest;
    }, eveningPunches[0]);

    parsed = parsed.filter(p => {
      if (p.minutes >= eveningStartRel && p.minutes <= eveningEndRel) {
        return p === latestEveningPunch;
      }
      return true;
    });
  }

  // 3. Custom duplicate entry removal for lunch boundary time
  const lunchBoundaryStart = getRelativeMinutesForShift(activeRules.lunchStart, isNightShift);
  const lunchBoundaryEnd = getRelativeMinutesForShift(activeRules.lunchEnd, isNightShift);

  const lunchPunches = parsed.filter(p => p.minutes >= lunchBoundaryStart && p.minutes <= lunchBoundaryEnd);

  if (lunchPunches.length >= 2) {
    const firstLunchPunch = lunchPunches[0];
    const lastLunchPunch = lunchPunches[lunchPunches.length - 1];

    parsed = parsed.filter(p => {
      if (p.minutes >= lunchBoundaryStart && p.minutes <= lunchBoundaryEnd) {
        return p === firstLunchPunch || p === lastLunchPunch;
      }
      return true;
    });
  } else if (lunchPunches.length === 1) {
    const lunchInPunch = lunchPunches[0];
    const hasPunchesAfterLunch = parsed.some(p => p.minutes > lunchInPunch.minutes);
    
    if (hasPunchesAfterLunch || lunchInPunch.minutes >= lunchBoundaryStart + 20) {
      lunchInPunch.type = 'IN';

      let autoOutMins = lunchInPunch.minutes - 30;
      if (autoOutMins < lunchBoundaryStart) {
        autoOutMins = lunchBoundaryStart;
      }
      if (autoOutMins >= lunchInPunch.minutes) {
        autoOutMins = Math.max(lunchBoundaryStart, lunchInPunch.minutes - 1);
      }

      const absoluteOutMins = isNightShift
        ? (autoOutMins >= 720 ? autoOutMins - 720 : autoOutMins + 720)
        : autoOutMins;
      const timeStr = formatMins(absoluteOutMins);
      const newOutPunch = {
        timeStr,
        minutes: autoOutMins,
        type: 'OUT' as const,
        original: `${timeStr} OUT (Auto)`
      };

      parsed.push(newOutPunch);
      parsed.sort((a, b) => a.minutes - b.minutes);
      isModified = true;
    }
  }
 
  if (parsed.length < originalLength) {
    isModified = true;
  }

  const isMinsInEveningRange = (mins: number) => {
    return mins >= eveningStartRel && mins <= eveningEndRel;
  };

  if (parsed.length > 0) {
    const lastParsed = parsed[parsed.length - 1];
    if (isMinsInEveningRange(lastParsed.minutes)) {
      lastParsed.type = 'OUT';
    }
  }

  const reconstructed: { minutes: number; type: 'IN' | 'OUT'; isInserted?: boolean }[] = [];

  const appendPunch = (mins: number, type: 'IN' | 'OUT', isInserted = false) => {
    reconstructed.push({ minutes: mins % 1440, type, isInserted });
  };

  const shiftStartVal = shiftStartMins;
  const relativeMins = (m: number) => {
    let diff = m - shiftStartVal;
    if (diff < -720) {
      diff += 1440;
    }
    return diff;
  };

  // Iterate over input punches and build a balanced alternate timeline
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const t = p.minutes;

    if (reconstructed.length === 0) {
      // First punch of the day must be an IN punch
      const prependMins = shiftStartMins;
      const rulesCutoffDiff = (() => {
        try {
          const cutMins = getRelativeMinutesForShift(activeRules.prependInCutoff, isNightShift);
          const prepMins = getRelativeMinutesForShift(activeRules.prependInTime, isNightShift);
          const diff = cutMins >= prepMins ? cutMins - prepMins : cutMins + 1440 - prepMins;
          return diff > 0 ? diff : 120;
        } catch {
          return 120;
        }
      })();
      const cutoffMins = shiftStartMins + rulesCutoffDiff;
      
      let diff = t - prependMins;
      if (diff > 720) diff -= 1440;
      else if (diff < -720) diff += 1440;

      let cutoffDiff = cutoffMins - prependMins;
      if (cutoffDiff > 720) cutoffDiff -= 1440;
      else if (cutoffDiff < -720) cutoffDiff += 1440;

      if (diff > cutoffDiff) {
        // Late arrival: prepend standard Arr Time (IN)
        appendPunch(prependMins, 'IN', true);
        isModified = true;
        
        // Reconstruct with t
        const gap = t >= prependMins ? t - prependMins : t + 1440 - prependMins;
        const relT = relativeMins(t);
        const relLunchStart = relativeMins(lunchBoundaryStart);
        const relLunchEnd = relativeMins(lunchBoundaryEnd);

        if (p.type === 'IN' && gap > 180 && relLunchStart <= relLunchEnd && relT >= relLunchEnd) {
          // Spans lunch: insert lunchtime OUT at t - 30 (exactly 30 minutes before return punch)
          appendPunch((t - 30 + 1440) % 1440, 'OUT', true);
          appendPunch(t, 'IN', false);
        } else {
          appendPunch(t, 'OUT', false);
        }
      } else {
        appendPunch(t, 'IN', false);
      }
    } else {
      const last = reconstructed[reconstructed.length - 1];
      const tLast = last.minutes;
      const typeLast = last.type;
      const gap = t >= tLast ? t - tLast : t + 1440 - tLast;

      const relTLast = relativeMins(tLast);
      const relLunchStart = relativeMins(lunchBoundaryStart);
      const relLunchEnd = relativeMins(lunchBoundaryEnd);
      const relT = relativeMins(t);

      if (typeLast === 'IN') {
        // Expecting OUT
        if (p.type === 'IN' && gap > 180 && relTLast <= relLunchStart && relT >= relLunchEnd) {
          // Spans lunchtime: insert lunch OUT at exactly t - 30 minutes
          appendPunch((t - 30 + 1440) % 1440, 'OUT', true);
          appendPunch(t, 'IN', false);
          isModified = true;
        } else {
          appendPunch(t, 'OUT', false);
        }
      } else {
        // Expecting IN
        let currentTypeLast: 'IN' | 'OUT' = typeLast;
        let currentTLast = tLast;
        let currentGap = gap;

        if (relTLast < relLunchStart && (gap >= 60 || relT >= relLunchStart)) {
          appendPunch((tLast + 10) % 1440, 'IN', true);
          isModified = true;
          currentTypeLast = 'IN';
          currentTLast = (tLast + 10) % 1440;
          currentGap = t >= currentTLast ? t - currentTLast : t + 1440 - currentTLast;
        }
        else if (relTLast >= relLunchStart && relTLast <= relLunchEnd && relT > relLunchEnd) {
          appendPunch((tLast + 30) % 1440, 'IN', true);
          isModified = true;
          currentTypeLast = 'IN';
          currentTLast = (tLast + 30) % 1440;
          currentGap = t >= currentTLast ? t - currentTLast : t + 1440 - currentTLast;
        }
        else if (relTLast > relLunchEnd && (gap >= 30 || isMinsInEveningRange(t))) {
          appendPunch((tLast + 10) % 1440, 'IN', true);
          isModified = true;
          currentTypeLast = 'IN';
          currentTLast = (tLast + 10) % 1440;
          currentGap = t >= currentTLast ? t - currentTLast : t + 1440 - currentTLast;
        }

        const relTLastUpdated = relativeMins(currentTLast);

        if (currentTypeLast === 'IN') {
          appendPunch(t, 'OUT', false);
        } else {
          const isLastPunch = i === parsed.length - 1;

          if (isLastPunch) {
            if (p.type === 'OUT') {
              let insertInAt = (currentTLast + 10) % 1440;
              if (currentGap > 180 && relTLastUpdated >= relLunchStart && relTLastUpdated <= relLunchEnd) {
                insertInAt = (currentTLast + 30) % 1440;
              } else if (currentGap > 180 && relTLastUpdated <= relLunchStart && relT >= relLunchStart && relT <= relLunchEnd) {
                insertInAt = (currentTLast + 30) % 1440;
              } else if (relTLastUpdated >= relLunchEnd) {
                insertInAt = (currentTLast + 10) % 1440;
              }
              if (insertInAt >= t && currentTLast < t) {
                insertInAt = Math.round((currentTLast + t) / 2);
              }
              appendPunch(insertInAt, 'IN', true);
              appendPunch(t, 'OUT', false);
              isModified = true;
            } else {
              appendPunch(t, 'IN', false);
            }
          } else {
            appendPunch(t, 'IN', false);
          }
        }
      }
    }
  }

  // Final check: end with OUT punch at standard exit time
  if (reconstructed.length > 0) {
    const last = reconstructed[reconstructed.length - 1];
    const lastMins = last.minutes;
    const standardExit = getExitTime();

    if (last.type === 'IN') {
      let exitMins = standardExit;
      if (exitMins <= lastMins && lastMins - exitMins < 720) {
        exitMins = (lastMins + 10) % 1440;
      }
      appendPunch(exitMins, 'OUT', true);
      isModified = true;
    } else {
      const thresholdMins = activeRules.warningThreshold || 90;
      const dist = standardExit >= lastMins ? standardExit - lastMins : 0;
      if (dist > thresholdMins) {
        const insertInAt = (lastMins + 10) % 1440;
        appendPunch(insertInAt, 'IN', true);
        appendPunch(standardExit, 'OUT', true);
        isModified = true;
      }
    }
  }

  // Format the reconstructed punches back to absolute clock standard
  const outputPunches = reconstructed.map((item, idx) => {
    const absoluteMins = isNightShift
      ? (item.minutes >= 720 ? item.minutes - 720 : item.minutes + 720)
      : item.minutes;
    const hrs = Math.floor(absoluteMins / 60);
    const mins = absoluteMins % 60;
    const timeStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    let label = '';
    if (item.type === 'IN') {
      if (idx === 0) {
        label = 'Arr Time';
      } else {
        label = `In${Math.floor(idx / 2) + 1}`;
      }
    } else {
      label = `Out${Math.floor(idx / 2) + 1}`;
    }

    const autoSuffix = item.isInserted ? ' (Auto)' : '';
    return `${timeStr} ${label}${autoSuffix}`;
  });

  return { repaired: isModified, punches: outputPunches };
};

// Helper calculating duty hours at top-level
const calculateDutyHours = (punches: string[]): { hours: number; minutes: number; formatted: string } => {
  if (!punches || punches.length < 2 || !isEmployeePresent(punches)) {
    return { hours: 0, minutes: 0, formatted: '-' };
  }

  let totalMinutes = 0;
  let activeInTime: { h: number; m: number } | null = null;

  punches.forEach(p => {
    const parts = p.trim().split(' ');
    if (parts.length < 2) return;
    const timeStr = parts[0];
    const type = parts.slice(1).join(' ').toUpperCase(); // supports multi-word types like "ARR TIME"

    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (isNaN(h) || isNaN(m)) return;

    const isCheckIn = type.startsWith('IN') || type.startsWith('ARR');
    const isCheckOut = type.startsWith('OUT');

    if (isCheckIn) {
      activeInTime = { h, m };
    } else if (isCheckOut && activeInTime) {
      const startMin = activeInTime.h * 60 + activeInTime.m;
      const endMin = h * 60 + m;
      let diff = endMin - startMin;
      if (diff < 0) {
        // Night shift overnight crossing midnight
        diff += 1440;
      }
      totalMinutes += diff;
      activeInTime = null; // reset
    }
  });

  const hrs = Math.floor(totalMinutes / 60);
  const actualMins = totalMinutes % 60;
  
  if (totalMinutes === 0) {
    return { hours: 0, minutes: 0, formatted: '-' };
  }
  
  return {
    hours: hrs,
    minutes: actualMins,
    formatted: `${hrs}h ${actualMins}m`
  };
};

// Helper calculating break time at top-level
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

    const isCheckIn = type.startsWith('IN') || type.startsWith('ARR');
    const isCheckOut = type.startsWith('OUT');

    if (isCheckOut) {
      // Exited OUT: record the break start
      activeOutTime = { h, m };
    } else if (isCheckIn && activeOutTime) {
      // Entered again IN: calculate break duration
      const startBreakMin = activeOutTime.h * 60 + activeOutTime.m;
      const endBreakMin = h * 60 + m;
      let diff = endBreakMin - startBreakMin;
      if (diff < 0) {
        // Night shift break crossing midnight
        diff += 1440;
      }
      totalBreakMinutes += diff;
      activeOutTime = null; // reset break tracker
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

const getPunchTime = (punches: string[], index: number, highlightAuto: boolean = false): string => {
  if (!punches || index >= punches.length) return '';
  const p = punches[index];
  if (!p) return '';
  const timePart = p.trim().split(' ')[0] || '';
  if (highlightAuto && p.toLowerCase().includes('(auto)')) {
    return `${timePart} [Auto]`;
  }
  return timePart;
};

interface AttendanceImportProps {
  employees: Employee[];
  onUpdateEmployee: (id: string, updatedFields: Partial<Employee>) => Promise<void>;
  triggerAlert: (type: 'success' | 'info', text: string) => void;
  onViewEmployeeProfile?: (id: string) => void;
  allPunchLogs?: Record<string, Record<string, string[]>>;
  ledgerMonth?: number;
  setLedgerMonth?: (m: number) => void;
  ledgerYear?: number;
  setLedgerYear?: (y: number) => void;
  onPunchesSynced?: (newPunches: Array<{ employeeId: string, date: string, punches: string[] }>) => void;
  viewOnly?: boolean;
}

export default function AttendanceImport({ 
  employees, 
  onUpdateEmployee, 
  triggerAlert, 
  onViewEmployeeProfile,
  allPunchLogs = {},
  ledgerMonth,
  setLedgerMonth,
  ledgerYear,
  setLedgerYear,
  onPunchesSynced,
  viewOnly = false
}: AttendanceImportProps) {
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [importMode, setImportMode] = useState<'roster' | 'attendance'>('attendance');
  const [importDate, setImportDate] = useState<string>('2026-05-25');
  
  // Fit filtering by absent days
  const [absentMonth, setAbsentMonth] = useState<number>(5); // Default to May
  const [absentYear, setAbsentYear] = useState<number>(2026); // Default to 2026
  const [absentDaysMin, setAbsentDaysMin] = useState<string>(''); // Default empty (disabled)
  const [absentDaysMax, setAbsentDaysMax] = useState<string>(''); // Default empty (disabled)

  // Row Layout: 'single' (1 punch per row + time option) or 'multiple' (multiple punch columns per row)
  const [rowLayout, setRowLayout] = useState<'single' | 'multiple'>('single');

  // Column Mappings State
  const [mappings, setMappings] = useState<Record<string, string>>({
    id: '',
    name: '',
    date: '',
    punchTime: '',
    punchType: '',
    monthlySalary: '',
    arrTime: '',
    out1: '',
    in2: '',
    out2: '',
    in3: '',
    out3: '',
    in4: '',
    out4: '',
    in5: '',
    out5: '',
    in6: '',
    out6: '',
    department: '',
    designation: '',
    role: '',
    shiftTime: '',
    gender: '',
    phone: '',
    address: '',
    salaryType: '',
    sundayPaid: '',
  });

  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [logsAlreadyExistForDate, setLogsAlreadyExistForDate] = useState<boolean>(false);
  const [isCheckingExistingLogs, setIsCheckingExistingLogs] = useState<boolean>(false);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Map Columns, 3: Preview & Commit
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-tabs Selection: 'view' for the Searchable Attendance Finder and 'upload' for CSV Importer
  const [activeSubTab, setActiveSubTab] = useState<'view' | 'upload'>('view');
  const [historyDate, setHistoryDate] = useState<string>(() => {
    if (ledgerYear && ledgerMonth) {
      return `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}-01`;
    }
    return '2026-05-25';
  });

  const [exportFromDate, setExportFromDate] = useState<string>(() => {
    if (ledgerYear && ledgerMonth) {
      return `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}-01`;
    }
    return '2026-06-01';
  });

  const [exportToDate, setExportToDate] = useState<string>(() => {
    if (ledgerYear && ledgerMonth) {
      const today = new Date();
      if (today.getFullYear() === ledgerYear && (today.getMonth() + 1) === ledgerMonth) {
        return today.toISOString().slice(0, 10);
      }
      const lastDay = new Date(ledgerYear, ledgerMonth, 0).getDate();
      return `${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    return '2026-06-05';
  });

  const [highlightAutoPunches, setHighlightAutoPunches] = useState<boolean>(false);
  const [exportEmployeeId, setExportEmployeeId] = useState<string>('');

  // Sync parent ledgerMonth and ledgerYear down to historyDate
  useEffect(() => {
    if (ledgerYear && ledgerMonth) {
      const parts = historyDate.split('-');
      if (parts.length === 3) {
        const selectYr = parseInt(parts[0], 10);
        const selectMo = parseInt(parts[1], 10);
        if (selectYr !== ledgerYear || selectMo !== ledgerMonth) {
          setHistoryDate(`${ledgerYear}-${String(ledgerMonth).padStart(2, '0')}-01`);
        }
      }
    }
  }, [ledgerMonth, ledgerYear]);

  // Sync child historyDate changes back up to parent ledgerMonth and ledgerYear
  useEffect(() => {
    if (!historyDate) return;
    const parts = historyDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!isNaN(year) && !isNaN(month)) {
        if (setLedgerMonth && month !== ledgerMonth) {
          setLedgerMonth(month);
        }
        if (setLedgerYear && year !== ledgerYear) {
          setLedgerYear(year);
        }
      }
    }
  }, [historyDate, ledgerMonth, ledgerYear, setLedgerMonth, setLedgerYear]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePunches, setDatePunches] = useState<Record<string, string[]>>({});
  const [dateShifts, setDateShifts] = useState<Record<string, string>>({});
  const [importShift, setImportShift] = useState<'Day Shift' | 'Night Shift'>('Day Shift');
  const [viewShift, setViewShift] = useState<'All Shifts' | 'Day Shift' | 'Night Shift'>('All Shifts');
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const [showRulesConfig, setShowRulesConfig] = useState<boolean>(false);
  const [rulesActiveTab, setRulesActiveTab] = useState<'Day Shift' | 'Night Shift'>('Day Shift');

  const handleRuleChange = (shift: 'Day' | 'Night', field: keyof ShiftRules, value: any) => {
    if (shift === 'Day') {
      setDayShiftRules(prev => ({
        ...prev,
        [field]: value
      }));
    } else {
      setNightShiftRules(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleCopyRules = () => {
    if (rulesActiveTab === 'Day Shift') {
      // Copy Day to Night
      const copied = { ...dayShiftRules };
      setNightShiftRules(copied);
      handleSaveRules(dayShiftRules, copied);
      triggerAlert('success', 'Successfully copied Day Shift rules to Night Shift! Dynamic rules updated.');
    } else {
      // Copy Night to Day
      const copied = { ...nightShiftRules };
      setDayShiftRules(copied);
      handleSaveRules(copied, nightShiftRules);
      triggerAlert('success', 'Successfully copied Night Shift rules to Day Shift! Dynamic rules updated.');
    }
  };

  const handleResetRulesToDefault = () => {
    const dayDefaults: ShiftRules = {
      prependInCutoff: '10:00',
      prependInTime: '08:00',
      morningDupStart: '07:30',
      morningDupEnd: '09:30',
      eveningDupStart: '19:00',
      eveningDupEnd: '20:30',
      lunchStart: '12:50',
      lunchEnd: '14:20',
      warningThreshold: 90,
      defaultExitTime: '18:00'
    };
    const nightDefaults: ShiftRules = {
      prependInCutoff: '21:00',
      prependInTime: '20:00',
      morningDupStart: '19:30',
      morningDupEnd: '20:30',
      eveningDupStart: '07:00',
      eveningDupEnd: '08:30',
      lunchStart: '01:00',
      lunchEnd: '02:30',
      warningThreshold: 90,
      defaultExitTime: '08:00'
    };

    if (rulesActiveTab === 'Day Shift') {
      setDayShiftRules(dayDefaults);
      handleSaveRules(dayDefaults, nightShiftRules);
      triggerAlert('success', 'Reset Day Shift rules to default values!');
    } else {
      setNightShiftRules(nightDefaults);
      handleSaveRules(dayShiftRules, nightDefaults);
      triggerAlert('success', 'Reset Night Shift rules to default values!');
    }
  };

  const [dayShiftRules, setDayShiftRules] = useState<ShiftRules>({
    prependInCutoff: '10:00',
    prependInTime: '08:00',
    morningDupStart: '07:30',
    morningDupEnd: '09:30',
    eveningDupStart: '19:00',
    eveningDupEnd: '20:30',
    lunchStart: '12:50',
    lunchEnd: '14:20',
    warningThreshold: 90,
    defaultExitTime: '18:00'
  });

  const [nightShiftRules, setNightShiftRules] = useState<ShiftRules>({
    prependInCutoff: '21:00',
    prependInTime: '20:00',
    morningDupStart: '19:30',
    morningDupEnd: '20:30',
    eveningDupStart: '07:00',
    eveningDupEnd: '08:30',
    lunchStart: '01:00',
    lunchEnd: '02:30',
    warningThreshold: 90,
    defaultExitTime: '08:00'
  });

  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    const rulesRef = doc(db, 'settings', 'attendance_rules');
    getDoc(rulesRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.dayRules) {
          const migratedDayRules = { ...data.dayRules };
          if (migratedDayRules.eveningDupStart === '17:00') {
            migratedDayRules.eveningDupStart = '19:00';
            setDoc(rulesRef, {
              ...data,
              dayRules: migratedDayRules
            }).catch(err => console.error("Auto-migrating rules to Firestore failed:", err));
          }
          setDayShiftRules(migratedDayRules);
        }
        if (data.nightRules) {
          const mR = data.nightRules;
          // Auto heal outdated default exit time or evening dup start in Firestore
          if (mR.prependInCutoff === '22:00' || mR.defaultExitTime === '06:00' || mR.eveningDupStart === '05:00') {
            const healedNightRules = {
              prependInCutoff: '21:00',
              prependInTime: '20:00',
              morningDupStart: '19:30',
              morningDupEnd: '20:30',
              eveningDupStart: '07:00',
              eveningDupEnd: '08:30',
              lunchStart: mR.lunchStart || '01:00',
              lunchEnd: mR.lunchEnd || '02:30',
              warningThreshold: mR.warningThreshold !== undefined ? mR.warningThreshold : 90,
              defaultExitTime: '08:00'
            };
            setDoc(rulesRef, {
              ...data,
              nightRules: healedNightRules
            }).catch(err => console.error("Healing night rules failed:", err));
            setNightShiftRules(healedNightRules);
          } else {
            setNightShiftRules(mR);
          }
        }
      } else {
        // Seed initial rules
        setDoc(rulesRef, {
          dayRules: {
            prependInCutoff: '10:00',
            prependInTime: '08:00',
            morningDupStart: '07:30',
            morningDupEnd: '09:30',
            eveningDupStart: '19:00',
            eveningDupEnd: '20:30',
            lunchStart: '12:50',
            lunchEnd: '14:20',
            warningThreshold: 90,
            defaultExitTime: '18:00'
          },
          nightRules: {
            prependInCutoff: '21:00',
            prependInTime: '20:00',
            morningDupStart: '19:30',
            morningDupEnd: '20:30',
            eveningDupStart: '07:00',
            eveningDupEnd: '08:30',
            lunchStart: '01:00',
            lunchEnd: '02:30',
            warningThreshold: 90,
            defaultExitTime: '08:00'
          }
        }).catch(err => console.error("Firestore seeding of rules failed:", err));
      }
    }).catch(err => console.error("Firestore loading of rules failed:", err));
  }, []);

  const handleSaveRules = async (dayOverride?: ShiftRules, nightOverride?: ShiftRules) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator can modify biometric connection rules.');
      return;
    }
    setSavingRules(true);
    try {
      const rulesRef = doc(db, 'settings', 'attendance_rules');
      await setDoc(rulesRef, {
        dayRules: dayOverride || dayShiftRules,
        nightRules: nightOverride || nightShiftRules
      });
      triggerAlert('success', 'Biometric connection engine rules successfully saved!');
    } catch (err: any) {
      console.error("Failed saving rules:", err);
    } finally {
      setSavingRules(false);
    }
  };
  const [editingRow, setEditingRow] = useState<{ idx: number, employeeId: string, name: string, punches: string[], existsInDb: boolean } | null>(null);
  const [showOnlyFaults, setShowOnlyFaults] = useState<boolean>(false);
  const [showOnlyAutoRepaired, setShowOnlyAutoRepaired] = useState<boolean>(false);
  const [showOnlyShiftWarning, setShowOnlyShiftWarning] = useState<boolean>(false);
  const [showOnlyNewEntrants, setShowOnlyNewEntrants] = useState<boolean>(false);

  // Compute number of rows with anomalies/faults (odd punches or break > 1.5h)
  const faultRowsCount = useMemo(() => {
    return previewData.filter(row => {
      const cleanPunches = getCleanPunches(row.punches);
      const isOdd = cleanPunches.length % 2 !== 0;
      const breakObj = calculateBreakTime(row.punches);
      const totalBreakMins = breakObj.hours * 60 + breakObj.minutes;
      const isLongBreak = totalBreakMins > 90;
      return isOdd || isLongBreak;
    }).length;
  }, [previewData]);

  // Compute unique non-existent employee codes from imported punch rows
  const uniqueNewAdditions = useMemo(() => {
    return Array.from(new Set(previewData.filter(row => !row.existsInDb).map(row => row.employeeId || row.id)));
  }, [previewData]);

  // Order faults first, or filter only faults, auto-repaired, shift warnings & new additions
  const sortedAndFilteredPreviewData = useMemo(() => {
    let list = [...previewData];
    if (showOnlyFaults || showOnlyAutoRepaired || showOnlyShiftWarning || showOnlyNewEntrants) {
      list = list.filter(row => {
        const cleanPunches = getCleanPunches(row.punches);
        const isOdd = cleanPunches.length % 2 !== 0;
        const breakObj = calculateBreakTime(row.punches);
        const totalBreakMins = breakObj.hours * 60 + breakObj.minutes;
        const isLongBreak = totalBreakMins > 90;
        const hasAnomaly = isOdd || isLongBreak;

        const empDetails = employees.find(e => e.id === row.employeeId);
        const empShift = empDetails?.shift || (importShift === 'Night Shift' ? 'NIGHT' : 'DAY');
        const activeRules = empShift === 'NIGHT' ? nightShiftRules : dayShiftRules;
        const { entryWarning, exitWarning } = getShiftWarnings(row.punches, empDetails?.shiftTime, activeRules);
        const hasShiftWarning = !!entryWarning || !!exitWarning;

        let passFault = true;
        let passAutoRepaired = true;
        let passShiftWarning = true;
        let passNewEntrant = true;

        if (showOnlyFaults) {
          passFault = hasAnomaly;
        }
        if (showOnlyAutoRepaired) {
          passAutoRepaired = !!row.isAutoRepaired;
        }
        if (showOnlyShiftWarning) {
          passShiftWarning = hasShiftWarning;
        }
        if (showOnlyNewEntrants) {
          passNewEntrant = !row.existsInDb;
        }

        return passFault && passAutoRepaired && passShiftWarning && passNewEntrant;
      });
    } else {
      list.sort((a, b) => {
        const aClean = getCleanPunches(a.punches);
        const aOdd = aClean.length % 2 !== 0;
        const aBreak = calculateBreakTime(a.punches);
        const aLongBreak = (aBreak.hours * 60 + aBreak.minutes) > 90;
        const aFault = (aOdd || aLongBreak) ? 1 : 0;

        const bClean = getCleanPunches(b.punches);
        const bOdd = bClean.length % 2 !== 0;
        const bBreak = calculateBreakTime(b.punches);
        const bLongBreak = (bBreak.hours * 60 + bBreak.minutes) > 90;
        const bFault = (bOdd || bLongBreak) ? 1 : 0;

        return bFault - aFault; // faults first
      });
    }
    return list;
  }, [previewData, showOnlyFaults, showOnlyAutoRepaired, showOnlyShiftWarning, showOnlyNewEntrants, employees, importShift, dayShiftRules, nightShiftRules]);

  // Memoize registered/active employees whose ID is entered into ledger (non-temp)
  const activeEmployees = useMemo(() => {
    const list = employees.filter(emp => !emp.id.toUpperCase().startsWith('EMP_TEMP_'));
    list.sort((a, b) => {
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
    return list;
  }, [employees]);

  // State variables for dynamic presence comparison and details modal
  const [compDate1, setCompDate1] = useState<string>('2026-05-25');
  const [compDate2, setCompDate2] = useState<string>('2026-05-26');
  const [punchesCompDate1, setPunchesCompDate1] = useState<Record<string, string[]>>({});
  const [punchesCompDate2, setPunchesCompDate2] = useState<Record<string, string[]>>({});
  const [loadingComparison, setLoadingComparison] = useState<boolean>(false);
  const [showAbsentDetailsModal, setShowAbsentDetailsModal] = useState<boolean>(false);

  // Load comparison punches dynamically for selected compare dates
  useEffect(() => {
    let isCancelled = false;
    const fetchComparisonLogs = async () => {
      setLoadingComparison(true);
      const temp1: Record<string, string[]> = {};
      const temp2: Record<string, string[]> = {};
      try {
        const promises = activeEmployees.map(async (emp) => {
          const ref1 = doc(db, 'employees', emp.id, 'punches', compDate1);
          const ref2 = doc(db, 'employees', emp.id, 'punches', compDate2);
          const [snap1, snap2] = await Promise.all([getDoc(ref1), getDoc(ref2)]);
          if (!isCancelled) {
            if (snap1.exists()) {
              temp1[emp.id] = snap1.data().punches || [];
            }
            if (snap2.exists()) {
              temp2[emp.id] = snap2.data().punches || [];
            }
          }
        });
        await Promise.all(promises);
      } catch (err) {
        console.error("Failed fetching comparison logs:", err);
      } finally {
        if (!isCancelled) {
          setPunchesCompDate1(temp1);
          setPunchesCompDate2(temp2);
          setLoadingComparison(false);
        }
      }
    };
    if (activeEmployees.length > 0 && compDate1 && compDate2) {
      fetchComparisonLogs();
    } else {
      setLoadingComparison(false);
    }
    return () => {
      isCancelled = true;
    };
  }, [activeEmployees, compDate1, compDate2]);

  // Compute employees present on compDate1 but absent on compDate2
  const missingOnCompDate2 = useMemo(() => {
    return activeEmployees.filter(emp => {
      const p1 = punchesCompDate1[emp.id] || [];
      const p2 = punchesCompDate2[emp.id] || [];
      
      const actualP1 = p1.filter(p => !p.startsWith('00:00') && p.trim() !== '');
      const actualP2 = p2.filter(p => !p.startsWith('00:00') && p.trim() !== '');
      
      const wasPresentOn1 = isEmployeePresent(actualP1);
      const isPresentOn2 = isEmployeePresent(actualP2);
      
      return wasPresentOn1 && !isPresentOn2;
    });
  }, [activeEmployees, punchesCompDate1, punchesCompDate2]);

  // Dynamic list of absent employees on the CURRENTLY selected date
  const absentEmployeesOnSelectedDate = useMemo(() => {
    return activeEmployees.filter(emp => {
      const punches = datePunches[emp.id] || [];
      const actualPunches = punches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
      return !isEmployeePresent(actualPunches);
    });
  }, [activeEmployees, datePunches]);

  // Load daily punches for "historyDate" directly from the cached/preloaded and synced allPunchLogs prop
  useEffect(() => {
    if (activeSubTab !== 'view') return;

    setLoadingHistory(true);
    const tempPunches: Record<string, string[]> = {};
    const tempShifts: Record<string, string> = {};

    activeEmployees.forEach((emp) => {
      const empPunches = allPunchLogs[emp.id] || {};
      tempPunches[emp.id] = empPunches[historyDate] || [];
      tempShifts[emp.id] = 'Day Shift';
    });

    setDatePunches(tempPunches);
    setDateShifts(tempShifts);
    setLoadingHistory(false);
  }, [historyDate, activeEmployees, activeSubTab, allPunchLogs]);

  // Instructions for T52F Wifi Attendance Machine
  const modelInstructions = [
    {
      title: "Smart Sync Biometric Logs (In-Out & New Entrants Auto-Registration)",
      steps: [
        "Export the transaction log report / Punch Log list from your devices (XLSX, XLS, CSV, TXT supported).",
        "Settings Rule: Rows 1-8 are skipped, Row 9 contains the column headers, and Row 10 onwards contains the record data.",
        "New Employee ID Auto-Registration: If an unknown employee ID is found, the system automatically registers them and records their punches!",
        "Supports multi-punch sequences beautifully (up to 8 logs: IN, OUT, Lunch, breaks, etc)."
      ]
    }
  ];

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isText = file.name.endsWith('.csv') || file.name.endsWith('.txt');
    
    if (!isExcel && !isText) {
      triggerAlert('info', 'Please upload an Excel spreadsheet (.xlsx / .xls) or comma-separated log (.csv / .txt)');
      return;
    }
    setCsvFile(file);
    
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (e) => {
        try {
          const ab = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(ab, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Retrieve raw rows
          const allRowsRaw: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
          const allRows = allRowsRaw.map(row => 
            row.map(cell => {
              if (cell === null || cell === undefined) return "";
              // Handle Excel dates or times formatted as numbers if they occur, otherwise standard string conversion
              return String(cell).trim();
            })
          );
          
          processRawRows(allRows);
        } catch (err) {
          console.error("XLSX processing failed:", err);
          triggerAlert('info', 'Failed to read Excel workbook. Check file corruption or formatting.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          let delimiter = ',';
          const sampleText = text.slice(0, Math.min(2000, text.length));
          if (sampleText.includes('\t')) delimiter = '\t';
          else if (sampleText.includes(';')) delimiter = ';';

          const allRows = parseCSVToRows(text, delimiter);
          processRawRows(allRows);
        } catch (err) {
          console.error("CSV text parsing failed:", err);
          triggerAlert('info', 'Failed to parse CSV text file.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Robust CSV parser supporting quotes and newlines within double quotes
  const parseCSVToRows = (text: string, delimiter: string = ','): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentVal);
        currentVal = '';
        i++;
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        currentRow.push(currentVal);
        currentVal = '';
        rows.push(currentRow);
        currentRow = [];
        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else {
        currentVal += char;
        i++;
      }
    }
    if (currentRow.length > 0 || currentVal !== '') {
      currentRow.push(currentVal);
      rows.push(currentRow);
    }
    return rows;
  };

  // Process rows with standard logic: Row 9 is index 8 (headers), Row 10 onwards is index 9 onwards (data)
  const processRawRows = (allRows: string[][]) => {
    try {
      if (allRows.length < 9) {
        triggerAlert('info', 'The uploaded file does not contain at least 9 rows for header configuration.');
        return;
      }

      // ROW 9 contains the headers (index 8)
      const headerRow = allRows[8];
      const headers = headerRow.map(h => (h || '').trim().replace(/^["']|["']$/g, ''));
      setRawHeaders(headers);

      // ROW 10 onwards contains data (index 9 onwards)
      const rows: Record<string, string>[] = [];
      for (let i = 9; i < allRows.length; i++) {
        const rowData = allRows[i];
        if (!rowData || rowData.length === 0) continue;
        
        let hasData = false;
        const rowObj: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          const val = (rowData[index] !== undefined && rowData[index] !== null) 
            ? String(rowData[index]).trim().replace(/^["']|["']$/g, '') 
            : '';
          if (val) hasData = true;
          rowObj[String(index)] = val;
        });

        if (hasData) {
          const joinedLow = rowData.join('').toLowerCase();
          if (joinedLow.includes('daily in & out report') || 
              joinedLow.includes('print date') || 
              joinedLow.includes('report date') || 
              joinedLow.includes('company name')) {
            continue;
          }
          rows.push(rowObj);
        }
      }

      setParsedRows(rows);

      // Guess column mappings (indices as strings)
      const initialMappings: Record<string, string> = {
        id: '',
        name: '',
        date: '',
        punchTime: '',
        punchType: '',
        monthlySalary: '',
        arrTime: '',
        out1: '',
        in2: '',
        out2: '',
        in3: '',
        out3: '',
        in4: '',
        out4: '',
        in5: '',
        out5: '',
        in6: '',
        out6: '',
        department: '',
        designation: '',
        role: '',
        shiftTime: '',
        gender: '',
        phone: '',
        address: '',
        salaryType: '',
        sundayPaid: '',
      };

      // By default, if the file has at least 7 columns, map the 7th column (index 6) to Arr Time
      if (headers.length >= 7) {
        initialMappings.arrTime = "6";
      }

      headers.forEach((h, idx) => {
        const low = h.toLowerCase().trim();
        const strIdx = String(idx);
        if (low === 'emp.code' || low === 'emp code' || h === 'Emp.Code' || low === 'emp_co' || low === 'emp id' || low === 'employee id' || low === 'staff id' || low === 'staff no' || low === 'pin') {
          initialMappings.id = strIdx;
        } else if (low === 'name' || h === 'Name' || low === 'employee name' || low === 'staff name' || low === 'emp name') {
          initialMappings.name = strIdx;
        } else if (low === 'department' || low === 'dept' || low === 'dep' || h === 'Department') {
          initialMappings.department = strIdx;
        } else if (low === 'designation' || low === 'desg' || low === 'design' || h === 'Designation') {
          initialMappings.designation = strIdx;
        } else if (low === 'role' || low === 'job' || h === 'Role') {
          initialMappings.role = strIdx;
        } else if (low === 'shift' || low === 'shift time' || low === 'shifttime' || h === 'Shift') {
          initialMappings.shiftTime = strIdx;
        } else if (low === 'gender' || low === 'sex' || h === 'Gender') {
          initialMappings.gender = strIdx;
        } else if (low === 'phone' || low === 'mobile' || low === 'contact' || low === 'phone no' || low === 'phone_no' || h === 'Phone') {
          initialMappings.phone = strIdx;
        } else if (low === 'address' || low === 'addr' || h === 'Address') {
          initialMappings.address = strIdx;
        } else if (low === 'salary type' || low === 'salary_type' || low === 'salarytype' || low === 'type') {
          initialMappings.salaryType = strIdx;
        } else if (low === 'sunday paid' || low === 'sunday_paid' || low === 'sundaypaid' || low === 'sunday') {
          initialMappings.sundayPaid = strIdx;
        } else if (low === 'arr.time' || low === 'arrtime' || low === 'arr time' || low === 'in1' || low === 'in 1') {
          initialMappings.arrTime = strIdx;
        } else if (low === 'out1' || low === 'out 1') {
          initialMappings.out1 = strIdx;
        } else if (low === 'in2' || low === 'in 2') {
          initialMappings.in2 = strIdx;
        } else if (low === 'out2' || low === 'out 2') {
          initialMappings.out2 = strIdx;
        } else if (low === 'in3' || low === 'in 3') {
          initialMappings.in3 = strIdx;
        } else if (low === 'out3' || low === 'out 3') {
          initialMappings.out3 = strIdx;
        } else if (low === 'in4' || low === 'in 4') {
          initialMappings.in4 = strIdx;
        } else if (low === 'out4' || low === 'out 4') {
          initialMappings.out4 = strIdx;
        } else if (low === 'in5' || low === 'in 5') {
          initialMappings.in5 = strIdx;
        } else if (low === 'out5' || low === 'out 5') {
          initialMappings.out5 = strIdx;
        } else if (low === 'in6' || low === 'in 6') {
          initialMappings.in6 = strIdx;
        } else if (low === 'out6' || low === 'out 6') {
          initialMappings.out6 = strIdx;
        } else if (low.includes('id') || low.includes('enroll') || low.includes('no.') || low.includes('emp_id') || low.includes('code')) {
          if (!initialMappings.id) initialMappings.id = strIdx;
        } else if (low.includes('salary') || low.includes('wage')) {
          initialMappings.monthlySalary = strIdx;
        }
      });

      // Special mapping check for multi-punches based on whether our file has Out1, In2 etc.
      const hasMultiPunches = headers.some(h => {
        const low = h.toLowerCase().trim();
        return low === 'out1' || low === 'in2' || low === 'out2' || low === 'arr.time' || low === 'arr time';
      }) || (headers.length >= 7);

      if (hasMultiPunches) {
        setRowLayout('multiple');
        headers.forEach((h, idx) => {
          const low = h.toLowerCase().trim();
          const strIdx = String(idx);
          if (low === 'arr.time' || low === 'arrtime' || low === 'arr time' || low === 'in1' || low === 'in 1') {
            initialMappings.arrTime = strIdx;
          } else if (low === 'out1' || low === 'out 1') {
            initialMappings.out1 = strIdx;
          } else if (low === 'in2' || low === 'in 2') {
            initialMappings.in2 = strIdx;
          } else if (low === 'out2' || low === 'out 2') {
            initialMappings.out2 = strIdx;
          } else if (low === 'in3' || low === 'in 3') {
            initialMappings.in3 = strIdx;
          } else if (low === 'out3' || low === 'out 3') {
            initialMappings.out3 = strIdx;
          } else if (low === 'in4' || low === 'in 4') {
            initialMappings.in4 = strIdx;
          } else if (low === 'out4' || low === 'out 4') {
            initialMappings.out4 = strIdx;
          } else if (low === 'in5' || low === 'in 5') {
            initialMappings.in5 = strIdx;
          } else if (low === 'out5' || low === 'out 5') {
            initialMappings.out5 = strIdx;
          } else if (low === 'in6' || low === 'in 6') {
            initialMappings.in6 = strIdx;
          } else if (low === 'out6' || low === 'out 6') {
            initialMappings.out6 = strIdx;
          }
        });
      } else {
        setRowLayout('single');
      }

      setMappings(initialMappings);
      setStep(2);
      triggerAlert('success', `Workbook read successfully! Found ${rows.length} transactions starting from Row 10. Columns parsed from Row 9.`);
    } catch (err) {
      console.error(err);
      triggerAlert('info', 'Failed to parse the uploaded file or extract headers.');
    }
  };

  // Standardize YYYY-MM-DD
  const parseDateToISO = (dateStr: string): string => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    
    // Check YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }

    // Check DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Check YYYYMMDD
    if (/^\d{8}$/.test(trimmed)) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    }

    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {}

    return trimmed;
  };

  // Standardize HH:MM
  const parseTimeToHM = (timeStr: string): string => {
    if (!timeStr) return '';
    const trimmed = timeStr.trim();
    
    // Extract HH:MM from timestamp like "2026-05-25 08:34:25"
    if (trimmed.includes(' ') && (trimmed.includes(':') || trimmed.includes('-'))) {
      const parts = trimmed.split(' ');
      const timePart = parts[parts.length - 1]; // Grab last block
      return parseTimeToHM(timePart);
    }

    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1]);
      const minutes = ampmMatch[2];
      const modifier = ampmMatch[3];
      if (modifier) {
        if (modifier.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (modifier.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    return trimmed.slice(0, 5); // default fallback
  };

  // Preview Processor
  const generatePreview = async () => {
    if (!mappings.id) {
      triggerAlert('info', 'You must map the database unique "Employee ID" column to continue.');
      return;
    }

    if (importMode === 'attendance' && !importDate) {
      triggerAlert('info', 'You must choose an Attendance Date to sync daily attendance.');
      return;
    }

    const normalizeId = (id: string): string => {
      if (!id) return '';
      const trimmed = id.trim().toLowerCase();
      const digits = trimmed.match(/\d+/);
      if (digits) {
        return String(parseInt(digits[0], 10));
      }
      return trimmed;
    };

    const isIdMatch = (id1: string, id2: string): boolean => {
      if (!id1 || !id2) return false;
      if (id1.toUpperCase().startsWith('EMP_TEMP_') || id2.toUpperCase().startsWith('EMP_TEMP_')) {
        return false;
      }
      return normalizeId(id1) === normalizeId(id2);
    };

    if (importMode === 'roster') {
      const matched = parsedRows.map(row => {
        const rawId = row[mappings.id] || '';
        let cleanedId = rawId.trim();
        const existing = employees.find(e => isIdMatch(e.id, cleanedId));
        if (existing) {
          cleanedId = existing.id;
        } else if (/^\d+$/.test(cleanedId)) {
          cleanedId = String(parseInt(cleanedId, 10));
        }

        const nameVal = mappings.name ? (row[mappings.name] || '') : '';
        let salaryVal = 20000;
        if (mappings.monthlySalary && row[mappings.monthlySalary]) {
          const parsedSalary = Number(row[mappings.monthlySalary]);
          if (!isNaN(parsedSalary) && parsedSalary > 0) {
            salaryVal = parsedSalary;
          } else if (existing) {
            salaryVal = existing.monthlySalary || 20000;
          }
        } else if (existing) {
          salaryVal = existing.monthlySalary || 20000;
        }

        return {
          id: existing ? existing.id : cleanedId,
          name: nameVal || `Employee ${cleanedId}`,
          monthlySalary: salaryVal,
          existsInDb: !!existing,
          rawRow: row
        };
      }).filter(row => row.id);

      if (matched.length === 0) {
        triggerAlert('info', 'No valid employee registration rows could be formed.');
        return;
      }
      setPreviewData(matched);
      setStep(3);
      return;
    }

    // Process Attendance multi-punches
    const groups: Record<
      string, 
      { 
        employeeId: string, 
        date: string, 
        rawPunches: { time: string, type: 'IN' | 'OUT' | '', label: string, sortOrder: number }[], 
        employeeName?: string,
        rawRow?: Record<string, string>
      }
    > = {};

    parsedRows.forEach(row => {
      const rawId = row[mappings.id] || '';
      if (!rawId) return;

      let cleanedId = rawId.trim();
      const existing = employees.find(e => isIdMatch(e.id, cleanedId));
      if (existing) {
        cleanedId = existing.id;
      } else if (/^\d+$/.test(cleanedId)) {
        cleanedId = String(parseInt(cleanedId, 10));
      }

      const standardizedDate = importDate;
      const groupKey = `${cleanedId}_${standardizedDate}`;
      const nameVal = mappings.name ? (row[mappings.name] || '').trim() : '';

      if (!groups[groupKey]) {
        groups[groupKey] = {
          employeeId: cleanedId,
          date: standardizedDate,
          rawPunches: [],
          employeeName: nameVal,
          rawRow: row
        };
      } else if (nameVal && !groups[groupKey].employeeName) {
        groups[groupKey].employeeName = nameVal;
      }

      if (rowLayout === 'single') {
        const rawTime = row[mappings.punchTime] || '';
        const formattedTime = parseTimeToHM(rawTime);
        if (!formattedTime) return;

        let activeType: 'IN' | 'OUT' | '' = '';
        if (mappings.punchType) {
          const val = (row[mappings.punchType] || '').toLowerCase();
          if (val.includes('in') || val.includes('check_in') || val.includes('masuk') || val === '0' || val.includes('work')) {
            activeType = 'IN';
          } else if (val.includes('out') || val.includes('check_out') || val.includes('keluar') || val === '1' || val.includes('lunch') || val.includes('off')) {
            activeType = 'OUT';
          }
        }
        groups[groupKey].rawPunches.push({ time: formattedTime, type: activeType, label: activeType || 'Punch', sortOrder: 0 });
      } else {
        // Multi columns layout in exact order requested by user:
        // 1. Arr Time (In1)
        // 2. Out1
        // 3. In2
        // 4. Out2
        // 5. In3
        // 6. Out3
        // 7. In4
        // 8. Out4
        // 9. In5
        // 10. Out5
        // 11. In6
        // 12. Out6
        const punchCols = [
          { key: 'arrTime', label: 'Arr Time', defaultType: 'IN' as const },
          { key: 'out1', label: 'Out1', defaultType: 'OUT' as const },
          { key: 'in2', label: 'In2', defaultType: 'IN' as const },
          { key: 'out2', label: 'Out2', defaultType: 'OUT' as const },
          { key: 'in3', label: 'In3', defaultType: 'IN' as const },
          { key: 'out3', label: 'Out3', defaultType: 'OUT' as const },
          { key: 'in4', label: 'In4', defaultType: 'IN' as const },
          { key: 'out4', label: 'Out4', defaultType: 'OUT' as const },
          { key: 'in5', label: 'In5', defaultType: 'IN' as const },
          { key: 'out5', label: 'Out5', defaultType: 'OUT' as const },
          { key: 'in6', label: 'In6', defaultType: 'IN' as const },
          { key: 'out6', label: 'Out6', defaultType: 'OUT' as const },
        ];

        punchCols.forEach((col, sIdx) => {
          const colName = mappings[col.key];
          if (colName) {
            const rawVal = row[colName];
            if (rawVal) {
              const formattedTime = parseTimeToHM(rawVal);
              if (formattedTime) {
                groups[groupKey].rawPunches.push({ 
                  time: formattedTime, 
                  type: col.defaultType, 
                  label: col.label, 
                  sortOrder: sIdx 
                });
              }
            }
          }
        });
      }
    });

    const listPreview = Object.values(groups).map(grp => {
      const sorted = [...grp.rawPunches];
      if (rowLayout === 'multiple') {
        // Sort by key index in the column order instead of chronologically
        sorted.sort((a, b) => a.sortOrder - b.sortOrder);
      } else {
        sorted.sort((a, b) => a.time.localeCompare(b.time));
      }
      
      let nextExpected: 'IN' | 'OUT' = 'IN';
      const parsedPunches = sorted.map(p => {
        let finalLabel = p.label;
        if (!finalLabel) {
          finalLabel = nextExpected;
          nextExpected = nextExpected === 'IN' ? 'OUT' : 'IN';
        }
        return `${p.time} ${finalLabel}`;
      });

      const existing = employees.find(e => isIdMatch(e.id, grp.employeeId) && !e.id.startsWith('EMP_TEMP_'));
      const empShift = existing?.shift || (importShift === 'Night Shift' ? 'NIGHT' : 'DAY');
      const activeRules = empShift === 'NIGHT' ? nightShiftRules : dayShiftRules;

      const repairResult = repairPunches(parsedPunches, existing, grp.rawRow, activeRules);

      return {
        id: grp.date,
        date: grp.date,
        employeeId: existing ? existing.id : grp.employeeId,
        name: grp.employeeName || existing?.name || `Employee ${grp.employeeId}`,
        punches: repairResult.punches,
        isAutoRepaired: repairResult.repaired,
        existsInDb: !!existing,
        rawRow: grp.rawRow
      };
    });

    if (listPreview.length === 0) {
      triggerAlert('info', 'No transaction log rows could be extracted from your file.');
      return;
    }

    setPreviewData(listPreview);
    setStep(3);

    if (importMode === 'attendance') {
      setIsCheckingExistingLogs(true);
      try {
        const testGroup = listPreview.slice(0, 30);
        const results = await Promise.all(
          testGroup.map(async (row) => {
            const ref = doc(db, 'employees', row.employeeId, 'punches', importDate);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const data = snap.data();
              return Array.isArray(data.punches) && data.punches.some((p: string) => !p.startsWith('00:00') && p.trim() !== '');
            }
            return false;
          })
        );
        const alreadyExists = results.some(found => found);
        setLogsAlreadyExistForDate(alreadyExists);
      } catch (err) {
        console.error("Error checking existing logs on preview:", err);
      } finally {
        setIsCheckingExistingLogs(false);
      }
    } else {
      setLogsAlreadyExistForDate(false);
    }
  };

  // Commit to Firestore
  const commitImportData = async (bypassConfirm = false) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only the authorized administrator can stream punch logs to the database.');
      return;
    }
    setIsProcessing(true);

    if (importMode === 'attendance' && !bypassConfirm) {
      setIsCheckingExisting(true);
      try {
        const testGroup = previewData.slice(0, 50);
        const results = await Promise.all(
          testGroup.map(async (row) => {
            const ref = doc(db, 'employees', row.employeeId, 'punches', importDate);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const data = snap.data();
              return Array.isArray(data.punches) && data.punches.some((p: string) => !p.startsWith('00:00') && p.trim() !== '');
            }
            return false;
          })
        );
        const alreadyExists = results.some(found => found);
        setIsCheckingExisting(false);

        if (alreadyExists) {
          setShowOverwriteConfirm(true);
          setIsProcessing(false);
          return;
        }
      } catch (err) {
        console.error("Error verifying existing day logs:", err);
        setIsCheckingExisting(false);
      }
    }

    const syncedPunchesLog: Array<{ employeeId: string, date: string, punches: string[] }> = [];

    try {
      const promises = previewData.map(async (row) => {
        const rawRow = row.rawRow || {};
        
        // Define robust default values and normalization
        const defaultRole = 'Loom Operator';
        const defaultDept = 'Loom';
        const defaultShift = importShift === 'Night Shift' ? '20:00-8:00' : '8:00-20:00';
        
        const extractedDept = mappings.department && rawRow[mappings.department] ? String(rawRow[mappings.department]).trim() : '';
        const extractedDesg = mappings.designation && rawRow[mappings.designation] ? String(rawRow[mappings.designation]).trim() : '';
        const extractedRole = mappings.role && rawRow[mappings.role] ? String(rawRow[mappings.role]).trim() : '';
        const extractedShift = mappings.shiftTime && rawRow[mappings.shiftTime] ? String(rawRow[mappings.shiftTime]).trim() : '';
        const extractedGender = mappings.gender && rawRow[mappings.gender] ? String(rawRow[mappings.gender]).trim() : '';
        const extractedPhone = mappings.phone && rawRow[mappings.phone] ? String(rawRow[mappings.phone]).trim() : '';
        const extractedAddress = mappings.address && rawRow[mappings.address] ? String(rawRow[mappings.address]).trim() : '';
        
        // Resolve fallbacks
        const finalRole = extractedRole || extractedDesg || defaultRole;
        const finalDesg = extractedDesg || extractedRole || defaultRole;
        const finalDept = extractedDept || defaultDept;
        let finalShift = extractedShift || defaultShift;
        if (finalShift === '001') {
          finalShift = '08:00-20:00';
        }
        const finalPhone = extractedPhone || '';
        const finalAddress = extractedAddress || '';
        
        let extractedSalaryType = 'fixed';
        if (mappings.salaryType && rawRow[mappings.salaryType]) {
          const sType = String(rawRow[mappings.salaryType]).trim().toLowerCase();
          if (sType.includes('hour')) extractedSalaryType = 'hourly';
          else if (sType.includes('piece')) extractedSalaryType = 'piece';
        }
        
        let extractedSundayPaid = 'Not Paid';
        if (mappings.sundayPaid && rawRow[mappings.sundayPaid]) {
          const sunPaid = String(rawRow[mappings.sundayPaid]).trim().toLowerCase();
          if (sunPaid.includes('yes') || sunPaid.includes('paid') || sunPaid === '1' || sunPaid === 'true') {
            extractedSundayPaid = 'Paid';
          }
        }
        
        // Humanized Gender Guessing / Normalization
        let genderVal = 'Male';
        const rawGenderLow = extractedGender.toLowerCase();
        if (rawGenderLow.includes('female') || rawGenderLow === 'f' || rawGenderLow.includes('wanita') || rawGenderLow.includes('perempuan')) {
          genderVal = 'Female';
        } else if (rawGenderLow.includes('male') || rawGenderLow === 'm' || rawGenderLow.includes('pria') || rawGenderLow.includes('laki')) {
          genderVal = 'Male';
        } else {
          // Intelligently guess gender based on name suffix patterns
          const nameLow = String(row.name).toLowerCase();
          if (nameLow.includes('kaur') || nameLow.includes('devi') || nameLow.includes('roshani') || nameLow.includes('kumari') || nameLow.includes('sheila') || nameLow.includes('mary')) {
            genderVal = 'Female';
          }
        }

        if (importMode === 'roster') {
          // Optimization: Skip redundant writes for existing profiles with no changes
          const existing = employees.find(e => e.id === row.id && !e.id.startsWith('EMP_TEMP_'));
          if (existing && 
              existing.name === row.name && 
              existing.monthlySalary === Number(row.monthlySalary) &&
              existing.role === (finalRole || existing.role) &&
              existing.designation === (finalDesg || existing.designation) &&
              existing.department === (finalDept || existing.department) &&
              existing.workingDays === (existing.workingDays !== undefined ? existing.workingDays : 26) &&
              existing.workingHours === (existing.workingHours !== undefined ? existing.workingHours : 8)) {
            return { success: true, skipped: true };
          }

          const fieldsToUpdate: Partial<Employee> = {
            id: row.id,
            name: row.name,
            monthlySalary: Number(row.monthlySalary),
            workingDays: existing ? (existing.workingDays !== undefined ? existing.workingDays : 26) : 26,
            workingHours: existing ? (existing.workingHours !== undefined ? existing.workingHours : 8) : 8,
            fullDaysAbsent: existing ? (existing.fullDaysAbsent !== undefined ? existing.fullDaysAbsent : 0) : 0,
            absentHours: existing ? (existing.absentHours !== undefined ? existing.absentHours : 0) : 0,
            absentMinutes: existing ? (existing.absentMinutes !== undefined ? existing.absentMinutes : 0) : 0,
            role: finalRole || (existing ? existing.role : ''),
            designation: finalDesg || (existing ? existing.designation : ''),
            department: finalDept || (existing ? existing.department : ''),
            shiftTime: finalShift || (existing ? existing.shiftTime : ''),
            gender: (genderVal as any) || (existing ? existing.gender : 'Male'),
            phone: finalPhone || (existing ? existing.phone : ''),
            address: finalAddress || (existing ? existing.address : ''),
            salaryType: (extractedSalaryType as any) || (existing ? existing.salaryType : 'fixed'),
            sundayPaid: (extractedSundayPaid as any) || (existing ? existing.sundayPaid : 'Not Paid'),
            shift: existing ? existing.shift : 'DAY' // preserve shift DAY/NIGHT state
          };
          await onUpdateEmployee(row.id, fieldsToUpdate);
          return { success: true, active: true };
        } else {
          // Auto-register employee if not existing in the DB yet
          if (!row.existsInDb) {
            const fieldsToUpdate: Partial<Employee> = {
              id: row.employeeId,
              name: row.name,
              monthlySalary: mappings.monthlySalary && rawRow[mappings.monthlySalary] ? (Number(rawRow[mappings.monthlySalary]) || 20000) : 20000,
              workingDays: 26,
              workingHours: 8,
              fullDaysAbsent: 0,
              absentHours: 0,
              absentMinutes: 0,
              role: finalRole,
              designation: finalDesg,
              department: finalDept,
              shiftTime: finalShift,
              shift: importShift === 'Night Shift' ? 'NIGHT' : 'DAY',
              gender: genderVal as any,
              phone: finalPhone,
              address: finalAddress,
              salaryType: extractedSalaryType as any,
              sundayPaid: extractedSundayPaid as any
            };
            await onUpdateEmployee(row.employeeId, fieldsToUpdate);
          }

          // Write biometric logs subcollection doc
          const ref = doc(db, 'employees', row.employeeId, 'punches', row.date);
          await setDoc(ref, {
            id: row.date,
            employeeId: row.employeeId,
            date: row.date,
            punches: row.punches,
            shift: importShift
          });

          syncedPunchesLog.push({
            employeeId: row.employeeId,
            date: row.date,
            punches: row.punches
          });

          return { success: true, active: true };
        }
      });

      const results = await Promise.allSettled(promises);
      let successCount = 0;
      let failCount = 0;

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
          const targetRow = previewData[idx];
          console.error(`Import sync failed for employeeId ${targetRow?.id || targetRow?.employeeId}:`, res.reason);
        }
      });

      if (onPunchesSynced && syncedPunchesLog.length > 0) {
        onPunchesSynced(syncedPunchesLog);
      }

      if (importMode === 'roster') {
        triggerAlert('success', `Roster database updated! Successfully registered or updated ${successCount} employee profiles in cloud Firestore.`);
      } else {
        triggerAlert('success', `Biometric ledger updated! Synced ${successCount} punch log dates successfully in cloud Firestore.`);
      }
      setIsProcessing(false);
      setHistoryDate(importDate);
      setActiveSubTab('view');
      resetState();
    } catch (err) {
      console.error(err);
      triggerAlert('info', 'An unexpected database error occurred.');
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setStep(1);
    setCsvFile(null);
    setParsedRows([]);
    setRawHeaders([]);
    setPreviewData([]);
    setImportDate('2026-05-25');
    setImportShift('Day Shift');
    setViewShift('All Shifts');
    setRowLayout('single');
    setLogsAlreadyExistForDate(false);
    setIsCheckingExistingLogs(false);
    setShowOnlyNewEntrants(false);
    setMappings({
      id: '',
      name: '',
      date: '',
      punchTime: '',
      punchType: '',
      monthlySalary: '',
      punchColumn1: '',
      punchColumn2: '',
      punchColumn3: '',
      punchColumn4: '',
      punchColumn5: '',
      punchColumn6: '',
      punchColumn7: '',
      punchColumn8: '',
    });
  };

  const openFileBrowser = () => {
    fileInputRef.current?.click();
  };

  // Helper to skip forward/backward daily date navigation
  const navigateDay = (offset: number) => {
    const d = new Date(historyDate);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + offset);
    // Format back to YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setHistoryDate(`${yyyy}-${mm}-${dd}`);
  };

  const getDatesInRange = (startDateStr: string, endDateStr: string): string[] => {
    const dates: string[] = [];
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
      
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 180) {
        alert("Selected date range is too wide. Please limit range to maximum 180 days.");
        return [];
      }

      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    } catch (e) {
      console.error("Error creating date range", e);
    }
    return dates;
  };

  const handleExportAttendanceRange = () => {
    if (!exportFromDate || !exportToDate) {
      alert("Please select both start and end dates.");
      return;
    }
    if (exportFromDate > exportToDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    const dateRangeList = getDatesInRange(exportFromDate, exportToDate);
    if (dateRangeList.length === 0) return;

    const workbook = XLSX.utils.book_new();
    let sheetsAdded = 0;

    dateRangeList.forEach((dateStr) => {
      const sheetData: any[] = [];

      activeEmployees.forEach((emp) => {
        const empPunches = allPunchLogs[emp.id] || {};
        const punches = empPunches[dateStr] || [];
        const isPresent = isEmployeePresent(punches);
        
        const workObj = calculateDutyHours(punches);
        const workFormatted = isPresent ? (`${workObj.hours}h ${workObj.minutes}m`) : '-';

        const breakObj = calculateBreakTime(punches);
        const breakFormatted = isPresent ? (breakObj.hours > 0 || breakObj.minutes > 0 ? `${breakObj.hours}h ${breakObj.minutes}m` : '0m') : '-';

        sheetData.push({
          'emp code': emp.id,
          'emp name': emp.name,
          'designation': emp.designation || '-',
          'SALARY BASIS': emp.salaryType === 'daily' ? 'Daily' : 'Monthly',
          'SALARY': emp.monthlySalary || 0,
          'ARR TIME': getPunchTime(punches, 0, highlightAutoPunches),
          'OUT1': getPunchTime(punches, 1, highlightAutoPunches),
          'IN2': getPunchTime(punches, 2, highlightAutoPunches),
          'OUT2': getPunchTime(punches, 3, highlightAutoPunches),
          'IN3': getPunchTime(punches, 4, highlightAutoPunches),
          'OUT3': getPunchTime(punches, 5, highlightAutoPunches),
          'SHIFT TIME': emp.shiftTime || '-',
          'TWH': workFormatted,
          'BREAK': breakFormatted
        });
      });

      // Rearrange by designation column in ascending order for every generated sheet
      sheetData.sort((a, b) => {
        const desigA = String(a['designation'] || '').toLowerCase().trim();
        const desigB = String(b['designation'] || '').toLowerCase().trim();
        return desigA.localeCompare(desigB);
      });

      if (sheetData.length > 0) {
        // Create a worksheet with the date on the first row
        const worksheet = XLSX.utils.aoa_to_sheet([[`Attendance Log Date: ${dateStr}`]]);
        
        // Add the JSON headers/data starting from the second row (A2)
        XLSX.utils.sheet_add_json(worksheet, sheetData, { origin: "A2" });
        
        // Freeze the top 2 rows: Row 1 (Title) and Row 2 (Headers)
        worksheet['!views'] = [
          { state: 'frozen', ySplit: 2, topLeftCell: 'A3', activePane: 'bottomLeft' }
        ];

        // Use the date string as the sheet name (e.g. "2026-06-01")
        XLSX.utils.book_append_sheet(workbook, worksheet, dateStr);
        sheetsAdded++;

        // Auto Column widths
        const maxKeys = Object.keys(sheetData[0]);
        worksheet['!cols'] = maxKeys.map((k) => {
          if (k === 'emp name') return { wch: 22 };
          if (k === 'designation') return { wch: 18 };
          if (k === 'TWH' || k === 'BREAK') return { wch: 16 };
          return { wch: 12 };
        });
      }
    });

    if (sheetsAdded === 0) {
      alert("No attendance data found in the selected date range.");
      return;
    }

    XLSX.writeFile(workbook, `Attendance_Logs_Range_${exportFromDate}_to_${exportToDate}.xlsx`);
    triggerAlert('success', `Exported workbook with ${sheetsAdded} date-wise sheets for ${activeEmployees.length} employees`);
  };

  const handleExportSingleEmployeeAttendance = (empId: string) => {
    const targetEmp = activeEmployees.find(e => e.id === empId);
    if (!targetEmp) {
      alert("Selected employee not found.");
      return;
    }

    if (!exportFromDate || !exportToDate) {
      alert("Please select both start and end dates.");
      return;
    }
    if (exportFromDate > exportToDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    const dateRangeList = getDatesInRange(exportFromDate, exportToDate);
    if (dateRangeList.length === 0) return;

    const workbook = XLSX.utils.book_new();
    const sheetData: any[] = [];

    dateRangeList.forEach((dateStr) => {
      const empPunches = allPunchLogs[targetEmp.id] || {};
      const punches = empPunches[dateStr] || [];
      const isPresent = isEmployeePresent(punches);

      const workObj = calculateDutyHours(punches);
      const workFormatted = isPresent ? (`${workObj.hours}h ${workObj.minutes}m`) : '-';

      const breakObj = calculateBreakTime(punches);
      const breakFormatted = isPresent ? (breakObj.hours > 0 || breakObj.minutes > 0 ? `${breakObj.hours}h ${breakObj.minutes}m` : '0m') : '-';

      let dayName = '';
      try {
        const dObj = new Date(dateStr);
        dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      } catch (e) {}

      const dateWithDay = dayName ? `${dateStr} (${dayName})` : dateStr;

      sheetData.push({
        'Date': dateWithDay,
        'Attendance Status': isPresent ? 'Present' : 'Absent',
        'ARR TIME': getPunchTime(punches, 0, highlightAutoPunches),
        'OUT1': getPunchTime(punches, 1, highlightAutoPunches),
        'IN2': getPunchTime(punches, 2, highlightAutoPunches),
        'OUT2': getPunchTime(punches, 3, highlightAutoPunches),
        'IN3': getPunchTime(punches, 4, highlightAutoPunches),
        'OUT3': getPunchTime(punches, 5, highlightAutoPunches),
        'TWH': workFormatted,
        'BREAK': breakFormatted
      });
    });

    const worksheetHeader = [
      [`Attendance Report: ${targetEmp.name} (Code: ${targetEmp.id})`],
      [`Period: ${exportFromDate} to ${exportToDate}`],
      []
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetHeader);
    XLSX.utils.sheet_add_json(worksheet, sheetData, { origin: "A4" });

    worksheet['!views'] = [
      { state: 'frozen', ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' }
    ];

    let sheetName = `${targetEmp.name}`.trim();
    if (sheetName.length > 20) {
      sheetName = sheetName.substring(0, 18);
    }
    sheetName = `${sheetName} (${targetEmp.id})`.replace(/[\/\\\?\*\[\]]/g, '').trim();
    if (sheetName.length > 30) {
      sheetName = sheetName.substring(0, 30);
    }
    if (!sheetName) sheetName = "Attendance Logs";

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const maxKeys = Object.keys(sheetData[0]);
    worksheet['!cols'] = maxKeys.map((k) => {
      if (k === 'Date') return { wch: 18 };
      if (k === 'Attendance Status') return { wch: 16 };
      if (k === 'TWH' || k === 'BREAK') return { wch: 16 };
      return { wch: 12 };
    });

    XLSX.writeFile(workbook, `Attendance_Report_${targetEmp.id}_${exportFromDate}_to_${exportToDate}.xlsx`);
    triggerAlert('success', `Exported worksheet with date-wise punch logs for ${targetEmp.name}`);
  };

  const handleExportClick = () => {
    if (exportEmployeeId) {
      handleExportSingleEmployeeAttendance(exportEmployeeId);
    } else {
      handleExportAttendanceRange();
    }
  };

  const humanSelectedDate = useMemo(() => {
    if (!historyDate) return '';
    const parts = historyDate.split('-');
    if (parts.length !== 3) return historyDate;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if (isNaN(dateObj.getTime())) return historyDate;
    return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [historyDate]);

  // Calculations for KPI blocks
  const { totalStaff, presentCount, absentCount, totalPunchesToday } = useMemo(() => {
    let total = 0;
    let present = 0;
    let punchesCount = 0;
    
    activeEmployees.forEach(emp => {
      const empShift = dateShifts[emp.id] || 'Day Shift';
      if (viewShift !== 'All Shifts' && empShift !== viewShift) {
        return;
      }
      
      total++;
      const punchesList = datePunches[emp.id] || [];
      const actualPunches = punchesList.filter(p => !p.startsWith('00:00') && p.trim() !== '');
      if (isEmployeePresent(actualPunches)) {
        present++;
        punchesCount += actualPunches.length;
      }
    });

    return {
      totalStaff: total,
      presentCount: present,
      absentCount: total - present,
      totalPunchesToday: punchesCount
    };
  }, [activeEmployees, datePunches, dateShifts, viewShift]);

  // Calculate company active dates for the selected absentMonth and absentYear
  const companyActiveDates = useMemo(() => {
    const monthStr = `${absentYear}-${String(absentMonth).padStart(2, '0')}`;
    const activeDates = new Set<string>();
    
    Object.entries(allPunchLogs || {}).forEach(([_, dateLogs]) => {
      Object.keys(dateLogs).forEach(date => {
        if (date.startsWith(monthStr)) {
          activeDates.add(date);
        }
      });
    });
    
    return Array.from(activeDates).sort();
  }, [allPunchLogs, absentMonth, absentYear]);

  // Filter list
  const filteredList = useMemo(() => {
    const filtered = activeEmployees.filter(emp => {
      if (filterEmployeeId && emp.id !== filterEmployeeId) return false;
      
      if (viewShift !== 'All Shifts') {
        const empShift = dateShifts[emp.id] || 'Day Shift';
        if (empShift !== viewShift) return false;
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchId = emp.id.toLowerCase().includes(q);
        const matchRole = emp.role && emp.role.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchRole) return false;
      }

      // Monthly absent days range filter
      let empAbsentDays = 0;
      let hasCalculatedAbsentDays = false;
      
      const calculateEmpAbsentDays = () => {
        if (hasCalculatedAbsentDays) return empAbsentDays;
        let count = 0;
        if (companyActiveDates.length > 0) {
          const empPunches = allPunchLogs[emp.id] || {};
          companyActiveDates.forEach(date => {
            const punches = empPunches[date] || [];
            const clean = punches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
            if (!isEmployeePresent(clean)) {
              count++;
            }
          });
        }
        empAbsentDays = count;
        hasCalculatedAbsentDays = true;
        return count;
      };

      if (absentDaysMin !== '') {
        const minDays = parseInt(absentDaysMin, 10);
        if (calculateEmpAbsentDays() < minDays) {
          return false;
        }
      }

      if (absentDaysMax !== '') {
        const maxDays = parseInt(absentDaysMax, 10);
        if (calculateEmpAbsentDays() > maxDays) {
          return false;
        }
      }

      return true;
    });

    // Explicitly sort ascending by numeric employee ID
    return [...filtered].sort((a, b) => {
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeEmployees, filterEmployeeId, searchQuery, viewShift, dateShifts, absentDaysMin, absentDaysMax, companyActiveDates, allPunchLogs]);

  return (
    <div className="space-y-6">
      
      {/* 2-Way Segmented Sub-Tab Switcher */}
      <div className="flex bg-slate-100 rounded-2xl p-1 max-w-lg shadow-inner select-none print:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab('view')}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'view'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={14} className={activeSubTab === 'view' ? 'text-teal-600 animate-pulse' : ''} />
          <span>View Daily Logs finder</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('upload')}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'upload'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload size={14} className={activeSubTab === 'upload' ? 'text-teal-600' : ''} />
          <span>Upload & Sync Logs (CSV)</span>
        </button>
      </div>

      {/* ==================== SUB-TAB 1: ATTENDANCE HISTORY FINDER & INSPECTOR ==================== */}
      {activeSubTab === 'view' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Top Control Filter Panel */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row justify-between gap-4 select-none">
            
            {/* Left: Date Navigation with Chevron controls */}
            <div className="space-y-1.5 min-w-[260px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Inspection Shift Date</label>
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1 border border-slate-150 relative">
                <button
                  onClick={() => navigateDay(-1)}
                  className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer hover:bg-white rounded-lg transition-all"
                  title="Previous Day"
                >
                  <ChevronRight size={14} className="rotate-180" />
                </button>
                <div className="flex-1 flex items-center gap-2 px-1 justify-center">
                  <Calendar size={13} className="text-teal-600 shrink-0" />
                  <input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="bg-transparent border-none text-[12px] font-bold text-slate-800 focus:outline-hidden focus:ring-0 min-w-[120px] cursor-pointer text-center"
                  />
                </div>
                <button
                  onClick={() => navigateDay(1)}
                  className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer hover:bg-white rounded-lg transition-all"
                  title="Next Day"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Middle: Dropdown Selection list */}
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Choose Staff Member</label>
              <select
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
              >
                <option value="">-- All Employees ({activeEmployees.length}) --</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name || 'Anonymous'} (ID: {emp.id})</option>
                ))}
              </select>
            </div>

            {/* Shift dropdown selector */}
            <div className="space-y-1.5 min-w-[170px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Filter by Shift</label>
              <select
                value={viewShift}
                onChange={(e) => setViewShift(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
              >
                <option value="All Shifts">All Shifts</option>
                <option value="Day Shift">Day Shift</option>
                <option value="Night Shift">Night Shift</option>
              </select>
            </div>

            {/* Right: Manual Text Search Box */}
            <div className="space-y-1.5 flex-grow min-w-[220px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Freeform Text search</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search Name, ID, or Shift Designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-150 focus:bg-white rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition-all text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>

          </div>

          {/* Monthly Absence Filter Tracker */}
          <div className="bg-slate-50 border border-slate-150 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center shrink-0">
                <Calendar size={18} />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black text-teal-700 uppercase tracking-widest block font-mono">Monthly Absence Filter Analytic Tracker</span>
                <p className="text-xs text-slate-500">
                  Filter employees by exact number of absent days in a selected month & year run.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Run Month:</span>
                <select
                  value={absentMonth}
                  onChange={(e) => setAbsentMonth(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                >
                  {[
                    { v: 1, l: 'January' },
                    { v: 2, l: 'February' },
                    { v: 3, l: 'March' },
                    { v: 4, l: 'April' },
                    { v: 5, l: 'May' },
                    { v: 6, l: 'June' },
                    { v: 7, l: 'July' },
                    { v: 8, l: 'August' },
                    { v: 9, l: 'September' },
                    { v: 10, l: 'October' },
                    { v: 11, l: 'November' },
                    { v: 12, l: 'December' },
                  ].map(m => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Run Year:</span>
                <select
                  value={absentYear}
                  onChange={(e) => setAbsentYear(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                >
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-700">{"Min Absences (>=):"}</span>
                <select
                  value={absentDaysMin}
                  onChange={(e) => setAbsentDaysMin(e.target.value)}
                  className="bg-teal-50 border border-teal-200 rounded-xl py-2 px-3 text-xs font-extrabold text-teal-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">-- No Min --</option>
                  {Array.from({ length: 32 }, (_, i) => i).map(d => (
                    <option key={d} value={String(d)}>{d} {d === 1 ? 'Day' : 'Days'}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-700">{"Max Absences (<=):"}</span>
                <select
                  value={absentDaysMax}
                  onChange={(e) => setAbsentDaysMax(e.target.value)}
                  className="bg-teal-50 border border-teal-200 rounded-xl py-2 px-3 text-xs font-extrabold text-teal-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">-- No Max --</option>
                  {Array.from({ length: 32 }, (_, i) => i).map(d => (
                    <option key={d} value={String(d)}>{d} {d === 1 ? 'Day' : 'Days'}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ==================== EXCEL DATE RANGE ATTENDANCE LOG DOWNLOADER ==================== */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <Download size={18} className="text-emerald-600" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block font-mono">Excel Date Range Logs Exporter</span>
                <p className="text-xs text-slate-500">
                  Select a date range to download custom daily biometric log streams to an Excel spreadsheet.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">From Date:</span>
                <input
                  type="date"
                  value={exportFromDate}
                  onChange={(e) => setExportFromDate(e.target.value)}
                  className="bg-slate-50 border border-slate-150 rounded-xl py-1.5 px-3 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">To Date:</span>
                <input
                  type="date"
                  value={exportToDate}
                  onChange={(e) => setExportToDate(e.target.value)}
                  className="bg-slate-50 border border-slate-150 rounded-xl py-1.5 px-3 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Select Employee:</span>
                <select
                  value={exportEmployeeId}
                  onChange={(e) => setExportEmployeeId(e.target.value)}
                  className="bg-slate-50 border border-slate-150 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-ellipsis max-w-xs"
                >
                  <option value="">-- All Employees (Multi-sheet) --</option>
                  {activeEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name || 'Anonymous'} (ID: {emp.id})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 md:border-l md:border-slate-150 md:pl-4 mr-1 py-1">
                <input
                  type="checkbox"
                  id="highlightAutoToggle"
                  checked={highlightAutoPunches}
                  onChange={(e) => setHighlightAutoPunches(e.target.checked)}
                  className="w-4 h-4 text-emerald-650 border-slate-350 rounded-md focus:ring-emerald-500 cursor-pointer shrink-0"
                />
                <label htmlFor="highlightAutoToggle" className="text-xs font-bold text-slate-500 cursor-pointer select-none hover:text-emerald-700 transition-colors">
                  Highlight Auto-punches
                </label>
              </div>

              <button
                type="button"
                onClick={handleExportClick}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4.5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-2"
              >
                <Download size={14} />
                Export Range Logs (.xlsx)
              </button>
            </div>
          </div>

          {/* KPI Statistics Metrics Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* KPI 1: Present staff */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex items-center justify-between col-span-1">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Staff Present on Date</span>
                <span className="text-xl font-extrabold text-slate-800 font-sans block">{presentCount} <span className="text-slate-400 text-sm font-semibold">/ {totalStaff}</span></span>
                <div className="w-32 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(presentCount / (totalStaff || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <Users size={20} />
              </div>
            </div>

            {/* KPI 2: Total Biometric handshakes */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex items-center justify-between col-span-1">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Synced Biometric Hits</span>
                <span className="text-xl font-extrabold text-sky-700 font-sans block">{totalPunchesToday} <span className="text-slate-400 text-xs font-medium uppercase font-mono">Punches</span></span>
                <p className="text-[9.5px] text-slate-400 mt-2 font-mono">Model T52F WiFi device log</p>
              </div>
              <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center shrink-0">
                <Database size={18} />
              </div>
            </div>

            {/* KPI 3: Absentees / Missing loggers */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col justify-between col-span-1">
              <div className="flex items-center justify-between w-full">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Unlogged / Absentees</span>
                  <span className="text-xl font-extrabold text-rose-600 font-sans block">{absentCount} <span className="text-slate-400 text-sm font-semibold">Employees</span></span>
                  <p className="text-[9.5px] text-rose-500 font-bold leading-none mt-2">
                    {((absentCount / (totalStaff || 1)) * 100).toFixed(0)}% Absent rate today
                  </p>
                </div>
                <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertCircle size={20} />
                </div>
              </div>

              {absentCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAbsentDetailsModal(true)}
                  className="mt-3.5 w-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10.5px] font-bold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-100"
                >
                  <Eye size={12} />
                  <span>View All {absentCount} Absent Details</span>
                </button>
              )}
            </div>

          </div>

          {/* May 25th vs May 26th Presence Difference Section */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 text-white shadow-xl space-y-4 font-sans select-none">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black tracking-widest uppercase font-mono px-2 py-0.5 rounded">Absence Spotlight</span>
                  {loadingComparison && <RefreshCw size={12} className="animate-spin text-slate-400" />}
                </div>
                <h4 className="text-sm font-extrabold text-white tracking-tight">Active Shift Comparison: Choose Spot Dates</h4>
                <p className="text-[10px] text-slate-400">Locating employees present on Date 1 but absent on Date 2 of your choosing</p>
              </div>

              {/* Dynamic Date Selection Controls */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-950/60 border border-slate-800/80 p-3 rounded-2xl w-full lg:w-auto">
                <div className="flex flex-col gap-1 min-w-[130px]">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 font-mono">Date 1 (Present)</span>
                  <input 
                    type="date"
                    value={compDate1}
                    onChange={(e) => setCompDate1(e.target.value)}
                    className="bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                  />
                </div>
                <div className="text-slate-600 text-xs self-center font-bold font-mono px-1">vs</div>
                <div className="flex flex-col gap-1 min-w-[130px]">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 font-mono">Date 2 (Absent)</span>
                  <input 
                    type="date"
                    value={compDate2}
                    onChange={(e) => setCompDate2(e.target.value)}
                    className="bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                  />
                </div>
                
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl px-3 py-1.5 text-center ml-auto lg:ml-2 shrink-0">
                  <span className="text-base font-black text-rose-400 font-mono block">{missingOnCompDate2.length}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block font-mono leading-none">Missing</span>
                </div>
              </div>
            </div>

            {loadingComparison ? (
              <div className="py-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin text-slate-400" />
                <span>Auditing biometric sessions for dynamic compare logs...</span>
              </div>
            ) : missingOnCompDate2.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-400">All registered employees who were present on <span className="font-mono text-slate-200">{compDate1}</span> are fully accounted for/present on <span className="font-mono text-slate-200">{compDate2}</span> too!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
                {missingOnCompDate2.map(emp => {
                  // Find punches for compDate1 to showcase their active clock-ins
                  const p1 = punchesCompDate1[emp.id] || [];
                  const p1Filtered = p1.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                  
                  return (
                    <div 
                      key={emp.id} 
                      className="bg-slate-850 border border-slate-800 hover:border-slate-700/80 p-4 rounded-2xl transition-all flex flex-col justify-between gap-3 relative overflow-hidden group"
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className="text-[9.5px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded uppercase font-black tracking-wider">
                            Employee ID: {emp.id}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" title={`Absent on ${compDate2}`} />
                        </div>
                        <p className="text-xs font-black text-slate-200 group-hover:text-white leading-tight mt-1">{emp.name}</p>
                        <p className="text-[9.5px] text-slate-400 font-medium uppercase font-mono">{emp.role || 'Associate Staff'} • {dateShifts[emp.id] || 'Day Shift'}</p>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-850 p-2.5 rounded-xl space-y-1 text-[9.5px]">
                        <div className="flex justify-between text-slate-500 gap-1.5">
                          <span className="font-mono truncate max-w-[130px]">{compDate1}:</span>
                          <span className="text-emerald-400 font-bold font-mono uppercase shrink-0">{p1Filtered.length} punches (Present)</span>
                        </div>
                        <div className="flex justify-between text-slate-500 gap-1.5">
                          <span className="font-mono truncate max-w-[130px]">{compDate2}:</span>
                          <span className="text-rose-400 font-bold font-mono uppercase shrink-0">0 punches (Absent)</span>
                        </div>
                      </div>

                      {onViewEmployeeProfile && (
                        <button
                          type="button"
                          onClick={() => onViewEmployeeProfile(emp.id)}
                          className="w-full mt-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all border border-slate-750"
                        >
                          <span>Inspect Roster Profile</span>
                          <ArrowRight size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MAIN DAILY LIST TABLE */}
          <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-rose-50 bg-slate-50/10 flex justify-between items-center select-none">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                  <Database size={13} className="text-slate-500" />
                  <span>Daily Punch Transcripts Ledger</span>
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Auditing mapped biometric streams for {humanSelectedDate}</p>
              </div>
              <span className="bg-slate-100 border text-slate-600 text-[10px] font-extrabold font-mono px-2.5 py-1 rounded-full uppercase">
                {filteredList.length} staff records matches
              </span>
            </div>

            {loadingHistory ? (
              <div className="p-16 text-center space-y-3 select-none">
                <RefreshCw size={24} className="animate-spin text-teal-600 mx-auto" />
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Locating Biometric Ledger streams...</p>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-16 text-center max-w-sm mx-auto space-y-3 font-sans">
                <AlertCircle size={24} className="text-slate-350 mx-auto animate-bounce" />
                <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider font-mono">No matching records</h5>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  No staff roster logs matched your query. Adjust search tags, selection dropdown, or choose another shift date.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto select-text font-sans">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#f8fafc]/80 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-150">
                    <tr>
                      <th className="px-5 py-3">Employee ID</th>
                      <th className="px-5 py-3">Staff Details</th>
                      <th className="px-5 py-3">Biometric Chronology (Model T52F)</th>
                      <th className="px-5 py-3 text-center font-mono">Duty Hours</th>
                      <th className="px-5 py-3 text-center font-mono animate-fade-in">Break Time</th>
                      <th className="px-5 py-3 text-center">Roster Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                    {filteredList.map((emp) => {
                      const punchesRaw = datePunches[emp.id] || [];
                      const punches = punchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                      const dutyObj = calculateDutyHours(punches);
                      const breakObj = calculateBreakTime(punches);
                      
                      // Status evaluations
                      let badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
                      let label = "Absent / Unlogged";

                      if (isEmployeePresent(punches)) {
                        if (punches.length % 2 !== 0) {
                          badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                          label = "Single punch (Missed OUT)";
                        } else {
                          badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-100";
                          label = "Shift Completed";
                        }
                      }

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/40 select-text transition-colors">
                          {/* Col 1: ID */}
                          <td className="px-5 py-4 font-mono font-black uppercase text-[11px] text-slate-800">
                            {emp.id}
                          </td>
                          
                          {/* Col 2: Info */}
                          <td className="px-5 py-4 font-sans">
                            <div>
                              <p className="text-[12.5px] font-black text-slate-800 leading-tight">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">{emp.role || 'Associate Staff'}</p>
                              {allPunchLogs && (
                                <p className="text-[9.5px] text-teal-700 font-extrabold mt-1.5 uppercase font-mono bg-teal-50/60 border border-teal-100/30 px-1.5 py-0.5 rounded-md inline-block">
                                  {(() => {
                                    const monthStr = `${absentYear}-${String(absentMonth).padStart(2, '0')}`;
                                    let empAbsentDays = 0;
                                    if (companyActiveDates.length > 0) {
                                      const empPunches = allPunchLogs[emp.id] || {};
                                      companyActiveDates.forEach(date => {
                                        const punches = empPunches[date] || [];
                                        const clean = punches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                                        if (!isEmployeePresent(clean)) {
                                          empAbsentDays++;
                                        }
                                      });
                                    }
                                    const monthLabel = [
                                      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                                    ][absentMonth - 1];
                                    return `${monthLabel} ${absentYear} Absences: ${empAbsentDays} ${empAbsentDays === 1 ? 'day' : 'days'}`;
                                  })()}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Col 3: Punches timeline */}
                          <td className="px-5 py-4 font-sans">
                            {punches.length === 0 ? (
                              <span className="text-[10.5px] font-semibold text-slate-350 italic">No device transactions found</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-w-sm">
                                {punches.map((pStr, pIdx) => {
                                  const isIN = pStr.toUpperCase().includes('IN') || pStr.toUpperCase().includes('ARR');
                                  const isAuto = pStr.toUpperCase().includes('(AUTO)');
                                  return (
                                    <span
                                      key={pIdx}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 transition-all ${
                                        isAuto
                                          ? 'bg-amber-100 text-amber-950 border-amber-500 border-2 shadow-xs font-extrabold ring-1 ring-amber-400'
                                          : isIN 
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                                            : 'bg-rose-50 text-rose-700 border-rose-100'
                                      }`}
                                      title={isAuto ? "Automatically repaired and inserted by the attendance engine" : undefined}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${isAuto ? 'bg-amber-600 animate-ping' : isIN ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                      <span>{pStr}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Col 4: Duty hours */}
                          <td className="px-5 py-4 text-center font-mono text-[11px] font-bold text-slate-700 select-all">
                            {dutyObj.formatted}
                          </td>

                          {/* Col 4b: Break time */}
                          <td className="px-5 py-4 text-center font-mono text-[11px] font-bold text-slate-700 select-all animate-fade-in">
                            {breakObj.formatted}
                          </td>

                          {/* Col 5: Status */}
                          <td className="px-5 py-4 text-center select-none text-[10px]">
                            <span className={`px-2.5 py-1 text-[10px] font-black uppercase font-mono tracking-wider rounded-lg border leading-none inline-block ${badgeColor}`}>
                              {label}
                            </span>
                          </td>

                          {/* Col 6: Actions */}
                          <td className="px-5 py-4 text-right select-none font-sans">
                            <button
                              onClick={() => onViewEmployeeProfile && onViewEmployeeProfile(emp.id)}
                              className="px-3 py-1.5 text-[10px] bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 font-extrabold uppercase rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Inspect full monthly calendar sheets"
                            >
                              <Eye size={11} />
                              <span>View Profile</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ==================== SUB-TAB 2: ORIGINAL EXPORT & STREAM BIOMETRIC CSV FILE ==================== */}
      {activeSubTab === 'upload' && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs animate-fade-in font-sans" id="biometrics-import-hub">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5 mb-5 select-none">
            <div>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 font-mono">
                <Clock size={16} className="text-teal-600 animate-pulse" />
                <span>Biometric WiFi Machine Sync Center</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1 font-sans">Interfacing [model: T52F WiFi] daily reports with Cloud Firestore security matrix.</p>
            </div>
            
            <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-slate-500">
              <span className={`px-2.5 py-1 rounded-full ${step === 1 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>1. OUTSIDE FILE</span>
              <ChevronRight size={10} />
              <span className={`px-2.5 py-1 rounded-full ${step === 2 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>2. CHOOSE MAPPINGS</span>
              <ChevronRight size={10} />
              <span className={`px-2.5 py-1 rounded-full ${step === 3 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>3. STREAM LIVE</span>
            </div>
          </div>

          {/* Info banners */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 select-none font-sans">
              {modelInstructions.map((info, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5.5 h-5.5 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                      {i === 0 ? <Users size={12} /> : <Clock size={12} />}
                    </div>
                    <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">{info.title}</h5>
                  </div>
                  <ol className="list-decimal pl-4.5 space-y-1 text-[10.5px] leading-relaxed text-slate-500">
                    {info.steps.map((st, sIdx) => (
                      <li key={sIdx}>{st}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* STEP 1: LOAD SHEETS */}
          {step === 1 && (
            <div className="space-y-4 font-sans">
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={openFileBrowser}
                className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-teal-500 bg-teal-50/20' 
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-350 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleChange}
                />
                
                <div className="w-11 h-11 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-4">
                  <Upload size={18} className="animate-bounce" />
                </div>

                <h4 className="text-xs font-bold text-slate-800 select-none">
                  Drop biometric transaction list (XLSX, XLS, CSV) here
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 select-none leading-none">
                  Compatible with biometric WiFi report files & automated roster sheets.
                </p>
                
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs"
                >
                  Browse Reports
                </button>
              </div>

            </div>
          )}

          {/* STEP 2: FIELD PAIRINGS GATEWAY */}
          {step === 2 && (
            <div className="space-y-5 font-sans">
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-start gap-3 select-none">
                <Settings2 size={16} className="text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-[11px] font-bold text-slate-700">Active Biometric Mapping Channel</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    We identified <strong>{parsedRows.length} transactions</strong>. Map columns to database keys. Our multi-punch sequence supports up to 4 checking events (4 INs & 4 OUTs max) per day.
                  </p>
                </div>
              </div>

              {importMode === 'attendance' && (
                <div className="flex items-center gap-3 bg-teal-50/40 p-3 rounded-xl border border-teal-100 select-none">
                  <ToggleLeft size={16} className="text-teal-600" />
                  <div className="flex gap-4.5 text-xs font-semibold">
                    <span className="text-slate-400 block pb-0.5 uppercase tracking-wider text-[9px]">Select Column Layout:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="radio" 
                        name="rowLayout" 
                        checked={rowLayout === 'single'} 
                        onChange={() => setRowLayout('single')}
                      />
                      <span>Single punch per row (Logs sequentially per day)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="radio" 
                        name="rowLayout" 
                        checked={rowLayout === 'multiple'} 
                        onChange={() => setRowLayout('multiple')}
                      />
                      <span>Multiple punched columns in one row (IN1, OUT1...)</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans">
                
                {/* Employee ID */}
                <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                    Employee ID Column <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={mappings.id}
                    onChange={(e) => setMappings({ ...mappings, id: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                  >
                    <option value="">-- Choose Key --</option>
                    {rawHeaders.map((h, idx) => (
                      <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 font-sans">Punches group around this standard ID primary index.</p>
                </div>

                {/* Employee Name Column */}
                <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20 mr-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                    Employee Name Column
                  </label>
                  <select
                    value={mappings.name}
                    onChange={(e) => setMappings({ ...mappings, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                  >
                    <option value="">-- Choose Column --</option>
                    {rawHeaders.map((h, idx) => (
                      <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 font-sans">Paints employee names dynamically from headers list.</p>
                </div>

                {importMode === 'roster' && (
                  <>
                    {/* Profile Department */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Department Column
                      </label>
                      <select
                        value={mappings.department}
                        onChange={(e) => setMappings({ ...mappings, department: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Loom --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Maps section (e.g. Loom, Folding, Office).</p>
                    </div>

                    {/* Profile Designation */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Designation Column
                      </label>
                      <select
                        value={mappings.designation}
                        onChange={(e) => setMappings({ ...mappings, designation: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Loom Operator --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Determines job titles (e.g. Loom Operator, Manager).</p>
                    </div>

                    {/* Profile Business Role */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Role Column
                      </label>
                      <select
                        value={mappings.role}
                        onChange={(e) => setMappings({ ...mappings, role: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Role --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Sets default business authorization role (e.g. Associate Staff).</p>
                    </div>

                    {/* Standard Profile Shift */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Shift Column
                      </label>
                      <select
                        value={mappings.shiftTime}
                        onChange={(e) => setMappings({ ...mappings, shiftTime: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Active --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Captures assigned timing (e.g. 8:00-20:00 or 20:00-8:00).</p>
                    </div>

                    {/* Profile Gender */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Gender Column
                      </label>
                      <select
                        value={mappings.gender}
                        onChange={(e) => setMappings({ ...mappings, gender: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Smart Guess --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Extracts or guesses gender based on name suffix list.</p>
                    </div>

                    {/* Profile Phone */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Phone Column
                      </label>
                      <select
                        value={mappings.phone}
                        onChange={(e) => setMappings({ ...mappings, phone: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Empty --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Retrieves communication mobile/phone numbers.</p>
                    </div>

                    {/* Profile Address */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Address Column
                      </label>
                      <select
                        value={mappings.address}
                        onChange={(e) => setMappings({ ...mappings, address: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Auto-Guess or Empty --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Saves complete permanent/home address details.</p>
                    </div>

                    {/* Profile Salary Type */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Profile Salary Type Column
                      </label>
                      <select
                        value={mappings.salaryType}
                        onChange={(e) => setMappings({ ...mappings, salaryType: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Fixed Rate by Default --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Identifies payment patterns (e.g. fixed, hourly, piece rate).</p>
                    </div>

                    {/* Profile Sunday Paid Policy */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Sunday Paid Column
                      </label>
                      <select
                        value={mappings.sundayPaid}
                        onChange={(e) => setMappings({ ...mappings, sundayPaid: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Not Paid by Default --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Checks if Sunday attendance is marked as paid time.</p>
                    </div>
                  </>
                )}

                {/* Date Column (Attendance only) */}
                {importMode === 'attendance' && (
                  <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                      Attendance Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={importDate}
                      onChange={(e) => setImportDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                    />
                    <p className="text-[9px] text-slate-400 font-sans">Choose the date for this attendance sheet import.</p>
                  </div>
                )}

                {/* Shift Selection (Attendance only) */}
                {importMode === 'attendance' && (
                  <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                      Assigned Shift <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={importShift}
                      onChange={(e) => {
                        const sVal = e.target.value as 'Day Shift' | 'Night Shift';
                        setImportShift(sVal);
                        setRulesActiveTab(sVal);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
                    >
                      <option value="Day Shift">Day Shift</option>
                      <option value="Night Shift">Night Shift</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-sans">Choose active shift (Day Shift or Night Shift) for import.</p>
                  </div>
                )}

                {/* Layout-specific Columns: Single punch time */}
                {importMode === 'attendance' && rowLayout === 'single' && (
                  <>
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Punch Time Column <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mappings.punchTime}
                        onChange={(e) => setMappings({ ...mappings, punchTime: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Choose Time --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">The hour/minute column (e.g. 08:00 AM or 13:15:30).</p>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Punch Status / Type (IN/OUT)
                      </label>
                      <select
                        value={mappings.punchType}
                        onChange={(e) => setMappings({ ...mappings, punchType: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Alternate on duplicate --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Checks 'check-in' or 'check-out' descriptors dynamically.</p>
                    </div>
                  </>
                )}

                {/* Layout-specific Columns: Multiple punches columns */}
                {importMode === 'attendance' && rowLayout === 'multiple' && (
                  <>
                    {/* 1. Arr Time */}
                    <div className="p-4 rounded-2xl border border-teal-200 bg-teal-500/5 space-y-2 relative">
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-teal-100 text-teal-800 tracking-wider">7th Column Default</div>
                      <label className="text-[10px] font-black text-teal-850 uppercase tracking-wider block font-mono">
                        1. Arr Time (In1) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mappings.arrTime}
                        onChange={(e) => setMappings({ ...mappings, arrTime: e.target.value })}
                        className="w-full bg-white border border-teal-200 rounded-xl p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-500 text-slate-850"
                      >
                        <option value="">-- Choose Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[8.5px] text-slate-450">Primary arrival punch time. Maps below ROW 8 column 7.</p>
                    </div>

                    {/* 2. Out1 */}
                    <div className="p-4 rounded-2xl border border-teal-150 space-y-2 bg-teal-50/10">
                      <label className="text-[10px] font-black text-teal-850 uppercase tracking-wider block font-mono">
                        2. Out1 (Time)
                      </label>
                      <select
                        value={mappings.out1}
                        onChange={(e) => setMappings({ ...mappings, out1: e.target.value })}
                        className="w-full bg-white border border-teal-200 rounded-xl p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-500 text-slate-850"
                      >
                        <option value="">-- Choose Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. In2 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        3. In2 (Time)
                      </label>
                      <select
                        value={mappings.in2}
                        onChange={(e) => setMappings({ ...mappings, in2: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Out2 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        4. Out2 (Time)
                      </label>
                      <select
                        value={mappings.out2}
                        onChange={(e) => setMappings({ ...mappings, out2: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 5. In3 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        5. In3 (Time)
                      </label>
                      <select
                        value={mappings.in3}
                        onChange={(e) => setMappings({ ...mappings, in3: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 6. Out3 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        6. Out3 (Time)
                      </label>
                      <select
                        value={mappings.out3}
                        onChange={(e) => setMappings({ ...mappings, out3: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 7. In4 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        7. In4 (Time)
                      </label>
                      <select
                        value={mappings.in4}
                        onChange={(e) => setMappings({ ...mappings, in4: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 8. Out4 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        8. Out4 (Time)
                      </label>
                      <select
                        value={mappings.out4}
                        onChange={(e) => setMappings({ ...mappings, out4: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 9. In5 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        9. In5 (Time)
                      </label>
                      <select
                        value={mappings.in5}
                        onChange={(e) => setMappings({ ...mappings, in5: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 10. Out5 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        10. Out5 (Time)
                      </label>
                      <select
                        value={mappings.out5}
                        onChange={(e) => setMappings({ ...mappings, out5: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 11. In6 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        11. In6 (Time)
                      </label>
                      <select
                        value={mappings.in6}
                        onChange={(e) => setMappings({ ...mappings, in6: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 12. Out6 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        12. Out6 (Time)
                      </label>
                      <select
                        value={mappings.out6}
                        onChange={(e) => setMappings({ ...mappings, out6: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Roster Mode Fields */}
                {importMode === 'roster' && (
                  <>
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20 font-sans">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono font-mono">
                        Monthly Base Salary
                      </label>
                      <select
                        value={mappings.monthlySalary}
                        onChange={(e) => setMappings({ ...mappings, monthlySalary: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Default Core Flat Rate --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

              </div>

              {importMode === 'attendance' && (
                <div className="p-4 rounded-3xl border border-teal-100 bg-teal-500/5 space-y-4">
                  <div className="flex items-center justify-between col-span-full">
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 bg-teal-100 rounded-xl flex items-center justify-center text-teal-750">
                         <Settings2 size={16} />
                       </div>
                       <div>
                         <h5 className="text-[11px] font-black text-teal-850 uppercase tracking-wider font-mono">Biometric Rules Engine</h5>
                         <p className="text-[9px] text-teal-600 font-sans mt-0.5">Control filters, auto-correctors & anomaly spotlighting</p>
                       </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRulesConfig(!showRulesConfig)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-705 border border-slate-250 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all select-none"
                    >
                      {showRulesConfig ? "Hide Rules" : "Configure Rules"}
                    </button>
                  </div>

                  {showRulesConfig && (
                    <div className="bg-white rounded-2xl border border-slate-150 p-4 space-y-4 animate-fadeIn">
                      {/* Rules Shift Tabs */}
                      <div className="flex rounded-xl bg-slate-50 p-1 border border-slate-100 font-sans">
                        <button
                          type="button"
                          onClick={() => setRulesActiveTab('Day Shift')}
                          className={`flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                            rulesActiveTab === 'Day Shift'
                              ? 'bg-white text-slate-850 shadow-xs border border-slate-200/50'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          Day Shift Rules {importShift === 'Day Shift' && '🟢'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRulesActiveTab('Night Shift')}
                          className={`flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                            rulesActiveTab === 'Night Shift'
                              ? 'bg-white text-slate-855 shadow-xs border border-slate-200/50'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          Night Shift Rules {importShift === 'Night Shift' && '🟢'}
                        </button>
                      </div>

                      {/* Editing fields for actively selected shift rules */}
                      {(() => {
                        const shiftKey = rulesActiveTab === 'Day Shift' ? 'Day' : 'Night';
                        const currentRules = rulesActiveTab === 'Day Shift' ? dayShiftRules : nightShiftRules;

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-slate-700">
                            {/* Group A: Auto-Repair params */}
                            <div className="space-y-4 border border-slate-100 p-3 rounded-2xl bg-slate-50/20 col-span-1">
                              <h6 className="text-[9px] font-black text-slate-550 uppercase tracking-wider font-mono border-b border-slate-100 pb-1">
                                🔧 Punch Reconstruction & Prepend Rules
                              </h6>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[8px] font-bold text-slate-550 block mb-1 font-mono uppercase tracking-wide">Prepend IN Cutoff (H:M)</label>
                                  <input
                                    type="text"
                                    value={currentRules.prependInCutoff}
                                    onChange={(e) => handleRuleChange(shiftKey, 'prependInCutoff', e.target.value)}
                                    placeholder="e.g. 10:00"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-center focus:outline-hidden text-slate-800 focus:ring-1 focus:ring-teal-500"
                                  />
                                  <span className="text-[8px] text-slate-400 leading-none block mt-0.5 font-sans">Prepend IN if first punch is after this.</span>
                                </div>

                                <div>
                                  <label className="text-[8px] font-bold text-slate-550 block mb-1 font-mono uppercase tracking-wide">Prepend IN Time (H:M)</label>
                                  <input
                                    type="text"
                                    value={currentRules.prependInTime}
                                    onChange={(e) => handleRuleChange(shiftKey, 'prependInTime', e.target.value)}
                                    placeholder="e.g. 08:00"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-center focus:outline-hidden text-slate-800 focus:ring-1 focus:ring-teal-500"
                                  />
                                  <span className="text-[8px] text-slate-400 leading-none block mt-0.5 font-sans">Standard shift start time to insert.</span>
                                </div>
                              </div>
                            </div>

                            {/* Group C: Warnings & Thresholds */}
                            <div className="space-y-4 border border-slate-100 p-3 rounded-2xl bg-slate-50/20 col-span-1">
                              <h6 className="text-[9px] font-black text-slate-550 uppercase tracking-wider font-mono border-b border-slate-100 pb-1">
                                ⚠️ Warnings & Fallbacks
                              </h6>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[8px] font-bold text-slate-555 block mb-1 font-mono uppercase tracking-wide">Shift Anomaly Toler. (mins)</label>
                                  <input
                                    type="number"
                                    value={currentRules.warningThreshold}
                                    onChange={(e) => handleRuleChange(shiftKey, 'warningThreshold', parseInt(e.target.value, 10) || 90)}
                                    placeholder="e.g. 90"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-center focus:outline-hidden text-slate-800 focus:ring-1 focus:ring-teal-500"
                                  />
                                  <span className="text-[8px] text-slate-400 leading-none block mt-0.5">Generates warning if punch exceeds this.</span>
                                </div>

                                <div>
                                  <label className="text-[8px] font-bold text-slate-555 block mb-1 font-mono uppercase tracking-wide">Fallback Shift Exit (H:M)</label>
                                  <input
                                    type="text"
                                    value={currentRules.defaultExitTime}
                                    onChange={(e) => handleRuleChange(shiftKey, 'defaultExitTime', e.target.value)}
                                    placeholder="e.g. 18:00"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-center focus:outline-hidden text-slate-800 focus:ring-1 focus:ring-teal-500"
                                  />
                                  <span className="text-[8px] text-slate-400 leading-none block mt-0.5">Standard exit time used for missing OUT.</span>
                                </div>
                              </div>
                            </div>

                            {/* Group B: Filter ranges */}
                            <div className="space-y-3 col-span-full border border-slate-100 p-3 rounded-2xl bg-slate-50/25">
                              <h6 className="text-[9px] font-black text-slate-550 uppercase tracking-wider font-mono border-b border-slate-100 pb-1">
                                ⏳ Double-Trigger Filtering Windows
                              </h6>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-2">
                                  <div className="text-[8.5px] font-bold text-slate-500 uppercase tracking-tight">Shift-Start mask (keep earliest)</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">Start (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.morningDupStart}
                                        onChange={(e) => handleRuleChange(shiftKey, 'morningDupStart', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">End (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.morningDupEnd}
                                        onChange={(e) => handleRuleChange(shiftKey, 'morningDupEnd', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-2">
                                  <div className="text-[8.5px] font-bold text-slate-500 uppercase tracking-tight">Shift-End mask (keep latest)</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">Start (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.eveningDupStart}
                                        onChange={(e) => handleRuleChange(shiftKey, 'eveningDupStart', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">End (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.eveningDupEnd}
                                        onChange={(e) => handleRuleChange(shiftKey, 'eveningDupEnd', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-2">
                                  <div className="text-[8.5px] font-bold text-slate-500 uppercase tracking-tight">Lunch Break mask (keep boundaries)</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">Start (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.lunchStart}
                                        onChange={(e) => handleRuleChange(shiftKey, 'lunchStart', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-bold text-slate-400 block mb-0.5 font-mono">End (H:M)</label>
                                      <input
                                        type="text"
                                        value={currentRules.lunchEnd}
                                        onChange={(e) => handleRuleChange(shiftKey, 'lunchEnd', e.target.value)}
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-md p-1 text-center text-xs font-mono text-slate-800 focus:ring-1 focus:ring-teal-500"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-2 border-t border-slate-150 grid grid-cols-3 gap-2.5 col-span-full select-none font-sans">
                              <button
                                type="button"
                                onClick={handleCopyRules}
                                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[9.5px] font-extrabold uppercase tracking-wider transition-all truncate border border-indigo-100 inline-flex items-center justify-center gap-1 cursor-pointer"
                                title={`Copy rules to the other shift`}
                              >
                                {rulesActiveTab === 'Day Shift' ? 'Copy Day Rules to Night' : 'Copy Night Rules to Day'}
                              </button>

                              <button
                                type="button"
                                onClick={handleResetRulesToDefault}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-[9.5px] font-extrabold uppercase tracking-wider border border-slate-250 transition-all cursor-pointer"
                              >
                                Reset Defaults
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSaveRules()}
                                disabled={savingRules}
                                className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-xl text-[9.5px] font-extrabold uppercase tracking-wider transition-all cursor-pointer shadow-xs inline-flex items-center justify-center gap-1"
                              >
                                {savingRules ? 'Saving Rules...' : 'Save Engine Rules'}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-5 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={resetState}
                  className="px-4.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={generatePreview}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  <span>Preview Logs</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & FINAL STREAM OUT TO CLOUD */}
          {step === 3 && (
            <div className="space-y-4 font-sans">
              
              {/* Dynamic live anomaly check & toggle banner */}
              {faultRowsCount > 0 ? (
                <div className="bg-rose-50 border border-rose-150 p-4.5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                      <AlertTriangle size={17} className="animate-pulse" />
                    </div>
                    <div>
                      <h5 className="text-[11.5px] font-bold text-rose-900 uppercase font-mono tracking-wider flex items-center gap-2">
                        <span>Discrepancy Warning Flag: {faultRowsCount} Anomaly Logs Detected</span>
                      </h5>
                      <p className="text-[10px] text-rose-700 leading-relaxed mt-0.5 font-sans">
                        Detected odd punch counts or **break duration exceeding 1.5 hours (90 mins)**. You are granted inline editing override access below to fix them.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOnlyFaults(!showOnlyFaults)}
                    className={`px-3.5 py-1.5 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      showOnlyFaults 
                        ? 'bg-rose-600 text-white border-rose-500' 
                        : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50 shadow-2xs'
                    }`}
                  >
                    <span>{showOnlyFaults ? "Show All Rows" : "Filter Faults Only"}</span>
                  </button>
                </div>
              ) : (
                <div className="bg-teal-50 border border-teal-150 p-4.5 rounded-2xl flex items-start gap-3 select-none">
                  <CheckCircle2 size={16} className="text-teal-600 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-[11px] font-bold text-teal-900 uppercase font-mono">Device Punch Stream Matrix Ready</h5>
                    <p className="text-[10px] text-teal-850 leading-relaxed mt-0.5 font-sans">
                      All grouped biometric punches are balanced. Confirm details before scheduling storage streams. We mapped <strong>{previewData.length} records</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Dynamic live check for pre-existing logs */}
              {isCheckingExistingLogs ? (
                <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl flex items-center gap-3 select-none animate-pulse">
                  <RefreshCw size={14} className="text-slate-500 animate-spin" />
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 font-bold">Verifying database stream status...</span>
                </div>
              ) : logsAlreadyExistForDate ? (
                <div className="bg-amber-50 border border-amber-200 p-4.5 rounded-2xl flex items-start gap-3 select-none">
                  <div className="w-9 h-9 bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                    <AlertTriangle size={17} className="text-amber-850 animate-bounce" />
                  </div>
                  <div>
                    <h5 className="text-[11.5px] font-bold text-amber-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <span>Existing logs detected on Database</span>
                    </h5>
                    <p className="text-[10.5px] text-amber-800 mt-1 font-sans font-medium">
                      Attendance records for this date (**{importDate}**) already exist in the database! Moving forward with <strong className="font-extrabold uppercase text-amber-950">"Stream punch logs"</strong> will <strong className="font-extrabold uppercase text-amber-950 text-rose-700 underline decoration-rose-300">replace and overwrite</strong> existing entries with the newly mapped punches.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Unique new additions detected alert banner */}
              {uniqueNewAdditions.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl flex items-start gap-3 select-none">
                  <div className="w-9 h-9 bg-amber-150 rounded-xl flex items-center justify-center text-amber-800 shrink-0 mt-0.5 border border-amber-200">
                    <UserPlus size={16} className="animate-pulse" />
                  </div>
                  <div>
                    <h5 className="text-[11.5px] font-bold text-amber-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <span>New Employee Code Addition Alert ({uniqueNewAdditions.length})</span>
                    </h5>
                    <p className="text-[10.5px] text-amber-850 mt-1 leading-relaxed font-sans font-medium">
                      The uploaded file contains employee codes that are not present in your database: <strong className="font-mono text-amber-950 font-black">{uniqueNewAdditions.join(', ')}</strong>. 
                      Proceeding will automatically **add and register these employees** as new profiles in the database.
                    </p>
                  </div>
                </div>
              )}

              {/* Filter Controls Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 pb-1 pt-1 font-sans">
                <span className="text-[10px] uppercase font-black text-slate-400 font-mono tracking-wider ml-1">Filter Preview List:</span>
                
                {/* Faults Filter Button */}
                <button
                  type="button"
                  onClick={() => setShowOnlyFaults(!showOnlyFaults)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    showOnlyFaults 
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs' 
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showOnlyFaults ? 'bg-rose-200' : 'bg-rose-500'}`}></span>
                  <span>Faults Only</span>
                </button>

                {/* Auto-Repaired Filter Button */}
                <button
                  type="button"
                  onClick={() => setShowOnlyAutoRepaired(!showOnlyAutoRepaired)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    showOnlyAutoRepaired 
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs' 
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showOnlyAutoRepaired ? 'bg-indigo-100' : 'bg-indigo-500'}`}></span>
                  <span>Auto-Repaired</span>
                </button>

                {/* Shift Warning Filter Button */}
                <button
                  type="button"
                  onClick={() => setShowOnlyShiftWarning(!showOnlyShiftWarning)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    showOnlyShiftWarning 
                      ? 'bg-amber-600 text-white border-amber-500 shadow-xs' 
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showOnlyShiftWarning ? 'bg-amber-150' : 'bg-amber-500'}`}></span>
                  <span>Shift Warning</span>
                </button>

                {/* New Additions Filter Button */}
                {uniqueNewAdditions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyNewEntrants(!showOnlyNewEntrants)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      showOnlyNewEntrants 
                        ? 'bg-teal-600 text-white border-teal-500 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showOnlyNewEntrants ? 'bg-teal-100' : 'bg-teal-500'}`}></span>
                    <span>New Additions</span>
                  </button>
                )}

                {/* Reset button if any filter is active */}
                {(showOnlyFaults || showOnlyAutoRepaired || showOnlyShiftWarning || showOnlyNewEntrants) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlyFaults(false);
                      setShowOnlyAutoRepaired(false);
                      setShowOnlyShiftWarning(false);
                      setShowOnlyNewEntrants(false);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:text-slate-700 cursor-pointer tracking-wider"
                  >
                    Clear Filters
                  </button>
                )}

                <div className="text-[10px] font-mono text-slate-400 ml-auto mr-1 font-bold">
                  Showing {sortedAndFilteredPreviewData.length} of {previewData.length} entries
                </div>
              </div>

              <div className="border border-slate-150 rounded-2xl overflow-hidden max-h-80 overflow-y-auto font-sans">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-150 select-none">
                    <tr>
                      <th className="px-4 py-3">Employee ID</th>
                      <th className="px-4 py-3">Full Name</th>
                      {importMode === 'roster' ? (
                        <th className="px-4 py-3">Base Salary (INR)</th>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-center font-mono">Sync Date</th>
                          <th className="px-4 py-3">Parsed Punch Chronology / Timeline</th>
                          <th className="px-4 py-3 text-center font-mono">Work Hours</th>
                          <th className="px-4 py-3 text-center font-mono">Break Time</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center font-mono">Discrepancy Status</th>
                      <th className="px-4 py-3 text-center font-mono">Roster Link</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                    {sortedAndFilteredPreviewData.map((row, idx) => {
                      const cleanPunches = getCleanPunches(row.punches);
                      const isOdd = cleanPunches.length % 2 !== 0;

                      const dutyObj = calculateDutyHours(row.punches);
                      const breakObj = calculateBreakTime(row.punches);
                      const breakMins = breakObj.hours * 60 + breakObj.minutes;
                      const isLongBreak = breakMins > 90;

                      // Find employee to locate shift timings info
                      const empDetails = employees.find(e => e.id === row.employeeId);
                      const shiftTime = empDetails?.shiftTime;
                      const empShift = empDetails?.shift || (importShift === 'Night Shift' ? 'NIGHT' : 'DAY');
                      const activeRules = empShift === 'NIGHT' ? nightShiftRules : dayShiftRules;
                      const { entryWarning, exitWarning } = getShiftWarnings(row.punches, shiftTime, activeRules);
                      const hasShiftWarning = !!entryWarning || !!exitWarning;

                      const hasAnomaly = isOdd || isLongBreak || hasShiftWarning;
                      let rowBgClass = '';
                      if (isOdd || isLongBreak) {
                        rowBgClass = 'bg-rose-50/20';
                      } else if (hasShiftWarning) {
                        rowBgClass = 'bg-amber-50/20';
                      }

                      return (
                        <tr key={idx} className={`hover:bg-slate-50/40 transition-colors ${rowBgClass}`}>
                          <td className="px-4 py-3 font-mono text-[11px] font-bold uppercase text-slate-800">
                            {row.employeeId || row.id}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-sans">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-xs">{row.name}</span>
                              {row.isAutoRepaired && (
                                <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[8.5px] font-extrabold px-1.5 py-0.25 rounded-md uppercase font-mono tracking-wider" title="Biometric timings auto-corrected (repaired odd counts)">
                                  Auto-Repaired
                                </span>
                              )}
                            </div>
                            {(entryWarning || exitWarning) && (
                              <div className="mt-1 flex flex-col gap-1 max-w-max">
                                {entryWarning && (
                                  <div className="inline-flex items-center gap-1 text-[9.5px] text-amber-800 bg-amber-50/85 rounded px-1.5 py-0.5 border border-amber-150 font-bold">
                                    <AlertCircle size={10} className="text-amber-500 shrink-0" />
                                    <span>{entryWarning}</span>
                                  </div>
                                )}
                                {exitWarning && (
                                  <div className="inline-flex items-center gap-1 text-[9.5px] text-amber-800 bg-amber-50/85 rounded px-1.5 py-0.5 border border-amber-150 font-bold">
                                    <AlertCircle size={10} className="text-amber-500 shrink-0" />
                                    <span>{exitWarning}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          {importMode === 'roster' ? (
                            <td className="px-4 py-3 text-slate-800">₹{(row.monthlySalary).toLocaleString('en-IN')}</td>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-center font-mono text-[10.5px] text-slate-500 font-bold">{row.date}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {row.punches.map((pStr: string, pIdx: number) => {
                                    const isIN = pStr.toUpperCase().includes('IN') || pStr.toUpperCase().includes('ARR');
                                    const isAuto = pStr.toUpperCase().includes('(AUTO)');
                                    return (
                                      <span 
                                        key={pIdx} 
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
                                          isAuto
                                            ? 'bg-amber-100 text-amber-955 border-amber-500 border-2 font-extrabold ring-1 ring-amber-400 shadow-xs'
                                            : isIN 
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-150' 
                                              : 'bg-rose-50 text-rose-700 border-rose-150'
                                        }`}
                                        title={isAuto ? "Automatically repaired and inserted by the attendance engine" : undefined}
                                      >
                                        {pStr}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-[11px] font-bold text-slate-800">
                                {dutyObj.formatted}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-[11px] font-bold text-slate-800">
                                {breakObj.formatted}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3 text-center select-none text-[10px]">
                            <div className="flex flex-col items-center gap-1 justify-center">
                              {isOdd ? (
                                <span className="bg-rose-50 text-rose-700 border border-rose-150 text-[8.5px] font-black px-2 py-0.5 rounded inline-flex items-center gap-0.5 animate-pulse font-mono">
                                  <AlertTriangle size={9} />
                                  <span>ODD FAULT ({cleanPunches.length})</span>
                                </span>
                              ) : isLongBreak ? (
                                <span className="bg-rose-50 text-rose-700 border border-rose-150 text-[8.5px] font-black px-2 py-0.5 rounded inline-flex items-center gap-0.5 font-mono" title={`Break duration is ${breakObj.formatted}`}>
                                  <AlertTriangle size={9} className="text-rose-500" />
                                  <span>LONG BREAK ({breakObj.formatted})</span>
                                </span>
                              ) : (
                                <span className="bg-slate-50 text-slate-500 border border-slate-150 text-[8.5px] font-black px-2 py-0.5 rounded inline-flex items-center gap-0.5 font-mono">
                                  <span>Balanced ({cleanPunches.length})</span>
                                </span>
                              )}

                              {hasShiftWarning && (
                                <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[8.5px] font-extrabold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 font-mono">
                                  <AlertCircle size={9} className="text-amber-500 shrink-0" />
                                  <span>SHIFT WARNING</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center select-none font-sans">
                            {row.existsInDb ? (
                              <span className="bg-emerald-50 text-emerald-800 text-[9px] font-black font-mono px-2 py-0.5 rounded border border-emerald-100">MATCHED</span>
                            ) : (
                              <span className="bg-amber-50 text-amber-800 text-[9px] font-black font-mono px-2 py-0.5 rounded border border-amber-100 font-mono">NEW ENTRANT</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!viewOnly ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const originalIdx = previewData.findIndex(p => p.employeeId === row.employeeId);
                                  setEditingRow({
                                    idx: originalIdx,
                                    employeeId: row.employeeId,
                                    name: row.name,
                                    punches: [...row.punches],
                                    existsInDb: row.existsInDb
                                  });
                                }}
                                className="px-2.5 py-1 text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 font-black uppercase rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                              >
                                <Edit size={10} />
                                <span>Override</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase italic select-none">VIEW ONLY</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end pt-5 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isProcessing}
                  className="px-4.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Back to Map
                </button>
                <button
                  type="button"
                  onClick={commitImportData}
                  disabled={isProcessing}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Streaming to Database...</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-current text-white shrink-0" />
                      <span>Stream punch logs</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ==================== ABSENTEE DETAILS DRAWER/MODAL ==================== */}
      {showAbsentDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans select-none animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100">
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-rose-100 text-rose-800 text-[9px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded">Absent Roster list</span>
                  <span className="text-[10px] text-slate-500 font-semibold">{humanSelectedDate}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-800">Unlogged / Absent Employees ({absentEmployeesOnSelectedDate.length})</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowAbsentDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer bg-white hover:bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center transition-all border"
              >
                ✕
              </button>
            </div>

            {/* List Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-white space-y-4 custom-scrollbar">
              {absentEmployeesOnSelectedDate.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-semibold space-y-2">
                  <span className="text-4xl">🎉</span>
                  <p className="text-xs">Amazing logs! 100% staff attendance today. Nobody is absent.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {absentEmployeesOnSelectedDate.map(emp => (
                    <div 
                      key={emp.id} 
                      className="bg-slate-50/50 border border-slate-100 hover:border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:bg-white transition-all group"
                    >
                      <div className="space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase font-black tracking-wider">
                            ID: {emp.id}
                          </span>
                          <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[8px] font-extrabold uppercase font-mono px-2 rounded-full">ABSENT TODAY</span>
                        </div>
                        <h5 className="text-[13px] font-black text-slate-800 leading-tight pt-1">{emp.name}</h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{emp.role || 'Associate Staff'}</p>
                      </div>

                      <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[10.5px] text-slate-500 font-medium font-sans">
                        <div className="flex justify-between">
                          <span>Base Salary:</span>
                          <span className="text-slate-700 font-bold">₹{emp.monthlySalary?.toLocaleString() || '0'} / mo</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Contact:</span>
                          <span className="text-slate-700 font-semibold">{emp.phone || 'Not configured'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 border-t border-slate-100 pt-3 mt-1 shrink-0">
                        {onViewEmployeeProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowAbsentDetailsModal(false);
                              onViewEmployeeProfile(emp.id);
                            }}
                            className="bg-teal-600 hover:bg-teal-700 text-white text-[10.5px] font-bold py-1.5 px-3 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs flex-1"
                          >
                            <span>View Full Profile</span>
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0 select-none">
              <button
                type="button"
                onClick={() => setShowAbsentDetailsModal(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold py-2 px-5 rounded-xl cursor-pointer transition-all"
              >
                Close list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== OVERWRITE WARNING MODAL ===================== */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans select-none animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 flex flex-col p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
                <AlertCircle size={22} className="animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide">Are you sure the date is correct?</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase font-mono mt-0.5">Date: {importDate}</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-sans mt-2">
              The system detected that **attendance logs already exist** for this selected date (**{importDate}**).
            </p>
            <p className="text-xs text-slate-500 leading-relaxed font-sans">
              Confirming **YES** will replace the existing logs for this day with the newly uploaded biometric data. Are you sure you wish to replace it?
            </p>

            <div className="flex gap-3 justify-end pt-3">
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  setIsProcessing(false);
                }}
                className="px-4 py-2 hover:bg-slate-100 text-slate-500 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                No, cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  commitImportData(true);
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Yes, replace logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== INTERACTIVE PUNCH EDITOR MODAL ===================== */}
      {editingRow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans select-none animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="space-y-1">
                <span className="bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded">
                  Edit Biometric punches
                </span>
                <h3 className="text-base font-extrabold text-slate-800">
                  Punch Editor for {editingRow.employeeId}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer bg-white hover:bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center transition-all border font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 bg-white space-y-5">
              {/* Employee Name edit */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block font-mono">
                  Employee Full Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingRow.name}
                    onChange={(e) => setEditingRow({ ...editingRow, name: e.target.value })}
                    className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden transition-all text-slate-800"
                    placeholder="Enter full name"
                  />
                  {!editingRow.existsInDb && (
                    <span className="bg-amber-50 text-amber-700 text-[8.5px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border border-amber-150 inline-flex items-center">
                      New Registrant
                    </span>
                  )}
                </div>
              </div>

              {/* Punches Edit */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block font-mono">
                    Punch Timeline Entries ({editingRow.punches.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRow({
                        ...editingRow,
                        punches: [...editingRow.punches, "18:00 OUT"]
                      });
                    }}
                    className="px-2.5 py-1 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 rounded-lg font-black uppercase tracking-wider transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Add Manual Punch</span>
                  </button>
                </div>

                {editingRow.punches.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-semibold border-2 border-dashed rounded-2xl bg-slate-50/30">
                    No punch records found. Click "Add Manual Punch" to insert.
                  </div>
                ) : (
                  <div className="space-y-2 border border-slate-100 p-3 rounded-2xl max-h-60 overflow-y-auto bg-slate-50/25">
                    {editingRow.punches.map((pStr, pIdx) => {
                      const parts = pStr.trim().split(' ');
                      const timeVal = parts[0] || '12:00';
                      const typeVal = parts[1] || 'IN';
                      const isAuto = pStr.toUpperCase().includes('(AUTO)');

                      return (
                        <div 
                          key={pIdx} 
                          className={`flex gap-2 items-center rounded-xl p-2 transition-all shadow-2xs border ${
                            isAuto 
                              ? 'bg-amber-100/90 border-amber-300 ring-1 ring-amber-400 text-amber-950 font-extrabold animate-pulse' 
                              : 'bg-white border-slate-100 text-slate-800'
                          }`}
                          title={isAuto ? "Automatically repaired and inserted by the attendance engine" : undefined}
                        >
                          {/* Time tag */}
                          <span className="text-[10px] font-mono text-slate-400 font-black w-6 text-center">#{pIdx+1}</span>

                          {/* Time input */}
                          <input
                            type="text"
                            value={timeVal}
                            placeholder="HH:MM"
                            onChange={(e) => {
                              const nextPunches = [...editingRow.punches];
                              nextPunches[pIdx] = `${e.target.value} ${typeVal}`;
                              setEditingRow({ ...editingRow, punches: nextPunches });
                            }}
                            className="bg-slate-50 border border-slate-200 hover:border-slate-350 focus:bg-white focus:border-indigo-500 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold font-mono text-center w-24 focus:outline-hidden transition-all"
                          />

                          {/* Type dropdown */}
                          <select
                            value={typeVal}
                            onChange={(e) => {
                              const nextPunches = [...editingRow.punches];
                              nextPunches[pIdx] = `${timeVal} ${e.target.value}`;
                              setEditingRow({ ...editingRow, punches: nextPunches });
                            }}
                            className="bg-white border border-slate-200 hover:border-slate-350 text-slate-800 rounded-lg px-2 py-1.5 text-xs font-sans font-bold select-none focus:outline-hidden transition-all"
                          >
                            <option value="IN">IN</option>
                            <option value="OUT">OUT</option>
                          </select>

                          {/* IN/OUT visual block indicator */}
                          <div className="flex-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black ${
                              typeVal === 'IN' 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                                : 'bg-amber-50 text-amber-800 border border-amber-100'
                            }`}>
                              {typeVal}
                            </span>
                          </div>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => {
                              const nextPunches = [...editingRow.punches];
                              nextPunches.splice(pIdx, 1);
                              setEditingRow({ ...editingRow, punches: nextPunches });
                            }}
                            className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-700 cursor-pointer transition-colors"
                            title="Delete punch log"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Alert for Odd numbers */}
              {getCleanPunches(editingRow.punches).length % 2 !== 0 ? (
                <div className="bg-rose-50 border border-rose-150 p-3 rounded-2xl flex items-start gap-2.5 select-none text-[10.5px]">
                  <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} />
                  <div className="text-rose-950 font-medium">
                    <span className="font-extrabold uppercase">Punch discrepancy alert:</span> This ledger sheet has an odd count of **{getCleanPunches(editingRow.punches).length} physical punches** (not counting empty/00:00). Consider adding or removing entries before saving.
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-2xl flex items-start gap-2.5 select-none text-[10.5px]">
                  <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                  <div className="text-emerald-950 font-bold uppercase tracking-wider">
                    🎉 Balanced! Even check-in sequence validated.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end shrink-0 select-none">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Sort punches chronologically before storing!
                  const cleanedPunches = [...editingRow.punches].sort((a, b) => {
                    const tA = (a.split(' ')[0] || '').trim();
                    const tB = (b.split(' ')[0] || '').trim();
                    return tA.localeCompare(tB);
                  });

                  const nextPreview = [...previewData];
                  nextPreview[editingRow.idx] = {
                    ...nextPreview[editingRow.idx],
                    name: editingRow.name.trim() || `Employee ${editingRow.employeeId}`,
                    punches: cleanedPunches
                  };
                  setPreviewData(nextPreview);
                  setEditingRow(null);
                  triggerAlert('success', `Updated punches for ${editingRow.name || editingRow.employeeId}! Select "Stream punch logs" to write to DB.`);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
              >
                <Save size={12} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
