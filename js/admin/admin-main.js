/* admin-main.js — Main Controller for Super Admin and Co-Admin Dashboards */
'use strict';

// ==================== SUPER ADMIN ==================
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');
  
  function tab(name) {
    console.log('[SADM] Switching to tab:', name);
    
    document.querySelectorAll('#view-sadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) item.classList.add('active');
      else item.classList.remove('active');
    });
    
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
    
    const tabs = {
      ids: () => ADMIN_SUPER_IDS.renderIDs(),
      lecturers: () => ADMIN_SUPER_USERS.renderLecturers(),
      sessions: () => ADMIN_SUPER_DATA.renderSessions(),
      database: () => ADMIN_SUPER_DATA.renderDatabase(),
      coadmins: () => ADMIN_SUPER_USERS.renderCoAdmins(),
      settings: () => ADMIN_SUPER_REPORTS.renderSettings(),
      courses: () => ADMIN_SUPER_DATA.renderCourses(),
      help: () => ADMIN_CORE.renderHelp('superAdmin'),
      reports: () => ADMIN_SUPER_REPORTS.renderOverallReports(),
      announcements: () => ADMIN_SUPER_REPORTS.renderAnnouncements()
    };
    if (tabs[name]) tabs[name]();
  }
  
  // Export helper functions for backward compatibility
  async function exportSingleSession(sessionId) {
    await ADMIN_SUPER_DATA.exportSingleSession(sessionId);
  }
  
  async function generateUID() {
    await ADMIN_SUPER_IDS.generateUID();
  }
  
  async function revokeUID(uid) {
    await ADMIN_SUPER_IDS.revokeUID(uid);
  }
  
  async function refreshUIDList() {
    await ADMIN_SUPER_IDS.refreshUIDList();
  }
  
  async function loadLecturers() {
    await ADMIN_SUPER_USERS.loadLecturers();
  }
  
  async function suspendLecturer(lecId) {
    await ADMIN_SUPER_USERS.suspendLecturer(lecId);
  }
  
  async function unsuspendLecturer(lecId) {
    await ADMIN_SUPER_USERS.unsuspendLecturer(lecId);
  }
  
  async function removeLecturer(lecId) {
    await ADMIN_SUPER_USERS.removeLecturer(lecId);
  }
  
  async function viewLecturerDetails(lecId) {
    await ADMIN_SUPER_USERS.viewLecturerDetails(lecId);
  }
  
  async function filterSessions() {
    await ADMIN_SUPER_DATA.filterSessions();
  }
  
  async function exportFilteredSessions() {
    await ADMIN_SUPER_DATA.exportFilteredSessions();
  }
  
  async function loadSessionLecturers() {
    await ADMIN_SUPER_DATA.loadSessionLecturers();
  }
  
  async function generateOverallReport() {
    await ADMIN_SUPER_REPORTS.generateOverallReport();
  }
  
  async function exportOverallReportToExcel() {
    await ADMIN_SUPER_REPORTS.exportOverallReportToExcel();
  }
  
  async function downloadOverallReportPDF() {
    await ADMIN_SUPER_REPORTS.downloadOverallReportPDF();
  }
  
  async function loadOverallReportLecturers() {
    await ADMIN_SUPER_REPORTS.loadOverallReportLecturers();
  }
  
  async function updateGlobalMinAttendance() {
    await ADMIN_SUPER_REPORTS.updateGlobalMinAttendance();
  }
  
  async function showAdminAnnouncementModal() {
    await ADMIN_SUPER_REPORTS.showAdminAnnouncementModal();
  }
  
  function toggleAdminAnnouncementFilters() {
    ADMIN_SUPER_REPORTS.toggleAdminAnnouncementFilters();
  }

  return {
    tab,
    exportSingleSession,
    generateUID,
    revokeUID,
    refreshUIDList,
    loadLecturers,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer,
    viewLecturerDetails,
    filterSessions,
    exportFilteredSessions,
    loadSessionLecturers,
    generateOverallReport,
    exportOverallReportToExcel,
    downloadOverallReportPDF,
    loadOverallReportLecturers,
    updateGlobalMinAttendance,
    showAdminAnnouncementModal,
    toggleAdminAnnouncementFilters,
    // Additional aliases
    updateSystemMinAttendance: ADMIN_SUPER_REPORTS.updateGlobalMinAttendance,
    createBackup: ADMIN_SUPER_DATA.createBackup,
    downloadBackup: ADMIN_SUPER_DATA.downloadBackup,
    deleteBackup: ADMIN_SUPER_DATA.deleteBackup,
    loadBackups: ADMIN_SUPER_DATA.loadBackups,
    deleteDataByRange: ADMIN_SUPER_REPORTS.deleteDataByRange,
    resetAllData: ADMIN_SUPER_REPORTS.resetAllData,
    loadSystemStats: ADMIN_SUPER_REPORTS.loadSystemStats,
    renderHelp: () => ADMIN_CORE.renderHelp('superAdmin'),
    viewSessionDetails: ADMIN_SUPER_DATA.viewSessionDetails,
    loadCourses: ADMIN_SUPER_DATA.loadCourses,
    loadCourseLecturers: ADMIN_SUPER_DATA.loadCourseLecturers,
    renderAnnouncements: ADMIN_SUPER_REPORTS.renderAnnouncements
  };
})();

// ==================== CO-ADMIN ==================
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  
  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    document.querySelectorAll('#view-cadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) item.classList.add('active');
      else item.classList.remove('active');
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
    
    const fns = { 
      ids: () => ADMIN_CO_IDS.renderIDs(),
      lecturers: () => ADMIN_CO_LECTURERS.renderLecturers(),
      sessions: () => ADMIN_CO_REPORTS.renderSessions(),
      database: () => ADMIN_CO_REPORTS.renderDatabase(),
      courses: () => ADMIN_CO_REPORTS.renderCourses(),
      backup: () => ADMIN_CO_REPORTS.renderBackup(),
      help: () => ADMIN_CORE.renderHelp('coAdmin')
    };
    if (fns[name]) fns[name]();
  }
  
  // Export helper functions
  async function generateUID() {
    await ADMIN_CO_IDS.generateUID();
  }
  
  async function sendUID(uid) {
    await ADMIN_CO_IDS.sendUID(uid);
  }
  
  async function refreshUIDList() {
    await ADMIN_CO_IDS.refreshUIDList();
  }
  
  async function suspendLecturer(lecId) {
    await ADMIN_CO_LECTURERS.suspendLecturer(lecId);
  }
  
  async function unsuspendLecturer(lecId) {
    await ADMIN_CO_LECTURERS.unsuspendLecturer(lecId);
  }
  
  async function removeLecturer(lecId) {
    await ADMIN_CO_LECTURERS.removeLecturer(lecId);
  }
  
  async function filterSessions() {
    await ADMIN_CO_REPORTS.filterSessions();
  }
  
  async function exportSessionsToExcel() {
    await ADMIN_CO_REPORTS.exportSessionsToExcel();
  }
  
  async function generateDepartmentReport() {
    await ADMIN_CO_REPORTS.generateDepartmentReport();
  }
  
  async function exportDepartmentReportToExcel() {
    await ADMIN_CO_REPORTS.exportDepartmentReportToExcel();
  }
  
  async function exportDepartmentReportToPDF() {
    await ADMIN_CO_REPORTS.exportDepartmentReportToPDF();
  }
  
  async function showCoAdminAnnouncementModal() {
    await ADMIN_CO_REPORTS.showCoAdminAnnouncementModal();
  }
  
  async function showCourseDetails(courseCode, lecturerId, year, semester) {
    await ADMIN_CO_REPORTS.showCourseDetails(courseCode, lecturerId, year, semester);
  }
  
  function filterStudentList(courseCode, lecturerId) {
    ADMIN_CO_REPORTS.filterStudentList(courseCode, lecturerId);
  }

  return {
    tab,
    generateUID,
    sendUID,
    refreshUIDList,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer,
    filterSessions,
    exportSessionsToExcel,
    generateDepartmentReport,
    exportDepartmentReportToExcel,
    exportDepartmentReportToPDF,
    loadDeptReportLecturers: ADMIN_CO_REPORTS.loadDeptReportLecturers,
    loadDepartmentCourses: ADMIN_CO_REPORTS.loadDepartmentCourses,
    loadDepartmentCourseLecturers: ADMIN_CO_REPORTS.loadDepartmentCourseLecturers,
    createDeptBackup: ADMIN_CO_REPORTS.createDeptBackup,
    downloadDeptBackup: ADMIN_CO_REPORTS.downloadDeptBackup,
    deleteDeptBackup: ADMIN_CO_REPORTS.deleteDeptBackup,
    loadDeptBackups: ADMIN_CO_REPORTS.loadDeptBackups,
    renderHelp: () => ADMIN_CORE.renderHelp('coAdmin'),
    showCoAdminAnnouncementModal,
    showCourseDetails,
    filterStudentList,
    renderCourseChart: ADMIN_CO_REPORTS.renderCourseChart,
    viewSessionDetails: ADMIN_CO_REPORTS.viewSessionDetails,
    exportSingleSession: ADMIN_CO_REPORTS.exportSingleSession
  };
})();

// Make globally available
window.SADM = SADM;
window.CADM = CADM;
console.log('[ADMIN] SADM and CADM loaded successfully from split modules');
