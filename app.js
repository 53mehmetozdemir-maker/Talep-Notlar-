import { renderRecords } from "./records.js";
import { loadDashboard } from "./dashboard.js";
import { loadUsers, loadDepts } from "./admin.js";

window.initApp = () => {
  renderRecords();
  loadDashboard();
  loadUsers();
  loadDepts();
};