# Security Specification for Firestore Rules

This document specifies the security requirements, data invariants, and validation rules for the SalaryPro Firestore ledger.

## 1. Data Invariants
- An employee document cannot be created or updated with negative salary, negative working days, or negative hours.
- Document IDs must conform to a safe string pattern: `^[a-zA-Z0-9_\-]+$`.
- Any user can read the employee records to see the company roster, but only authenticated users with valid sessions can execute updates or creations.

## 2. Dirty Dozen Payloads & Responses
1. **Negative Salary injection**: `{"id": "EMP-001", "name": "Rahul", "monthlySalary": -100}` -> EXPECT: PERMISSION_DENIED
2. **Negative Working Days injection**: `{"id": "EMP-001", "name": "Rahul", "workingDays": -5}` -> EXPECT: PERMISSION_DENIED
3. **Invalid Email format or unverified payload**: Update with spoof profile -> EXPECT: PERMISSION_DENIED
4. **Invalid document ID with junk characters**: Creating `employees/EMP_@@@_junk` -> EXPECT: PERMISSION_DENIED
5. **No name provided on mandatory keys**: Creating non-temporary employee with blank name / empty keys -> EXPECT: PERMISSION_DENIED
6. **Days absent exceeding working days**: `{"fullDaysAbsent": 31, "workingDays": 26}` -> EXPECT: PERMISSION_DENIED
7. **Negative absent hours**: `{"absentHours": -1}` -> EXPECT: PERMISSION_DENIED
8. **Absent minutes out of bounds (>=60)**: `{"absentMinutes": 62}` -> EXPECT: PERMISSION_DENIED
9. **Absent minutes negative**: `{"absentMinutes": -5}` -> EXPECT: PERMISSION_DENIED
10. **Hijacking ownerId or setting custom claims** -> EXPECT: PERMISSION_DENIED
11. **Updating immutable fields (e.g., id mismatch)** -> EXPECT: PERMISSION_DENIED
12. **Blank keys size mismatch during creation**: Sending additional unrequested shadow fields -> EXPECT: PERMISSION_DENIED
