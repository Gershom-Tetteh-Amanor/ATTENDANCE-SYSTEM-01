/* session-reports.js — Reports for Lecturer/TA Dashboard */
'use strict';

const SESSION_REPORTS = (() => {
  const core = () => window.SESSION_CORE;
  
  async function loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const myId = core().getCurrentLecturerId();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
       
