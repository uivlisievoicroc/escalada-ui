import React from 'react';
import AdminAuditView from './AdminAuditView';
import controlPanelStyles from './ControlPanel.module.css';

const AdminAuditPage: React.FC = () => {
  return (
    <div className={controlPanelStyles.container}>
      <section className={controlPanelStyles.adminBar}>
        <AdminAuditView className="" showBackLink showLogout />
      </section>
    </div>
  );
};

export default AdminAuditPage;
