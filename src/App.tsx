import React, { useState, useEffect } from 'react';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './views/DashboardView';
import { ComplianceDashboardView } from './views/ComplianceDashboardView';
import { ObligationsView } from './views/ObligationsView';
import { FacilitiesView } from './views/FacilitiesView';
import { WasteView } from './views/WasteView';
import { WaterView } from './views/WaterView';
import { AirView } from './views/AirView';
import { EnergyView } from './views/EnergyView';
import { InspectionsView } from './views/InspectionsView';
import { DocumentsView } from './views/DocumentsView';
import { ReportsView } from './views/ReportsView';
import { AssistantView } from './views/AssistantView';
import { SubscriptionView } from './views/SubscriptionView';
import { AuditLogsView } from './views/AuditLogsView';
import { CalendarView } from './views/CalendarView';
import { GeotechView } from './views/GeotechView';
import { api, CurrentUser, Organization, Facility, CalendarEventItem, GeotechProject } from './services/api';
import { useFeedback } from './components/FeedbackContext';

export default function App() {
  const { showToast, confirmAction } = useFeedback();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Core Data
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [obligations, setObligations] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [wasteRecords, setWasteRecords] = useState<any[]>([]);
  const [waterRecords, setWaterRecords] = useState<any[]>([]);
  const [airRecords, setAirRecords] = useState<any[]>([]);
  const [energyRecords, setEnergyRecords] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<any[]>([]);
  const [inspectionTemplates, setInspectionTemplates] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [geotechProjects, setGeotechProjects] = useState<GeotechProject[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize session
  const initSession = async () => {
    try {
      const me = await api.getMe();
      setCurrentUser(me.user);
      setActiveOrg(me.organization);
      setOrganizations(me.availableOrganizations);
      api.setContext(me.organization.id, me.user.email);
      await loadAllData();
    } catch (e) {
      console.error('Session load error, showing login:', e);
      setShowAuthModal(true);
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        dash,
        obs,
        facs,
        wst,
        wtr,
        ar,
        nrg,
        insps,
        capas,
        tmpls,
        docs,
        calEvents,
        geoProjects,
        logs
      ] = await Promise.all([
        api.getDashboardAnalytics(),
        api.getObligations(),
        api.getFacilities(),
        api.getWaste(),
        api.getWater(),
        api.getAir(),
        api.getEnergy(),
        api.getInspections(),
        api.getCorrectiveActions(),
        api.getInspectionTemplates(),
        api.getDocuments(),
        api.getCalendarEvents(),
        api.getGeotechProjects(),
        api.getAuditLogs()
      ]);

      setDashboardData(dash);
      setObligations(obs);
      setFacilities(facs);
      setWasteRecords(wst);
      setWaterRecords(wtr);
      setAirRecords(ar);
      setEnergyRecords(nrg);
      setInspections(insps);
      setCorrectiveActions(capas);
      setInspectionTemplates(tmpls);
      setDocuments(docs);
      setCalendarEvents(calEvents);
      setGeotechProjects(geoProjects);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const handleSwitchOrg = async (orgId: string) => {
    const selectedOrg = organizations.find(o => o.id === orgId);
    if (!selectedOrg) return;
    setActiveOrg(selectedOrg);
    api.setContext(orgId, currentUser?.email || 'admin@ecoinntelligence.com');
    await loadAllData();
  };

  const handleSwitchLabUser = async (email: string) => {
    try {
      const res = await api.login(email);
      setCurrentUser(res.user);
      setActiveOrg(res.organization);
      await loadAllData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetSeed = async () => {
    const confirmed = await confirmAction({
      title: 'Restaurar base de datos de laboratorio',
      message: '¿Desea restaurar la base de datos de laboratorio al estado inicial con todas las migraciones 001-038?',
      confirmLabel: 'Restaurar BD',
      danger: true
    });
    if (confirmed) {
      try {
        await api.resetSeed();
        await loadAllData();
        showToast('Base de datos restaurada satisfactoriamente.', 'success');
      } catch (e: any) {
        showToast(e.message || 'Error al restaurar la base de datos.', 'error');
      }
    }
  };

  const handleLogout = () => {
    setShowAuthModal(true);
  };

  // Determine permissions based on role
  const role = currentUser?.role || 'admin';
  const canEdit = role !== 'lector';

  // Compute alert counts
  const overdueCount = obligations.filter(o => o.status === 'vencida' || (o.status !== 'cumplida' && o.dueDate < '2026-11-04')).length;
  const openCapaCount = correctiveActions.filter(c => c.status === 'abierta' || c.status === 'en_implementacion').length;
  const alertCounts = { overdueObligations: overdueCount, openCapa: openCapaCount };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar for Desktop */}
      <div className="hidden md:block">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          activeOrg={activeOrg}
          onLogout={handleLogout}
          alertCounts={alertCounts}
        />
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          <div className="relative z-10">
            <Sidebar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsMobileMenuOpen(false);
              }}
              currentUser={currentUser}
              activeOrg={activeOrg}
              onLogout={handleLogout}
              alertCounts={alertCounts}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Header
          currentUser={currentUser}
          activeOrg={activeOrg}
          organizations={organizations}
          onSwitchOrg={handleSwitchOrg}
          onSwitchLabUser={handleSwitchLabUser}
          onResetSeed={handleResetSeed}
          alertCounts={alertCounts}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          isMobileMenuOpen={isMobileMenuOpen}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50/70" role="main">
          {activeTab === 'dashboard' && (
            <DashboardView
              data={dashboardData}
              loading={loading}
              onNavigate={setActiveTab}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'compliance' && (
            <ComplianceDashboardView
              userRole={role}
              facilities={facilities}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'obligations' && (
            <ObligationsView
              obligations={obligations}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              events={calendarEvents}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'geotech' && (
            <GeotechView
              projects={geotechProjects}
              facilities={facilities}
              activeOrg={activeOrg}
              userName={currentUser?.name || 'Administrador'}
              userRole={role}
              canEdit={canEdit}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'facilities' && (
            <FacilitiesView
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={role === 'admin'}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'waste' && (
            <WasteView
              records={wasteRecords}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'water' && (
            <WaterView
              records={waterRecords}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'air' && (
            <AirView
              records={airRecords}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'energy' && (
            <EnergyView
              records={energyRecords}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'inspections' && (
            <InspectionsView
              inspections={inspections}
              correctiveActions={correctiveActions}
              templates={inspectionTemplates}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
              initialTab="inspections"
            />
          )}

          {activeTab === 'capa' && (
            <InspectionsView
              inspections={inspections}
              correctiveActions={correctiveActions}
              templates={inspectionTemplates}
              facilities={facilities}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
              initialTab="capa"
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsView
              documents={documents}
              facilities={facilities}
              obligations={obligations}
              onRefresh={loadAllData}
              canEdit={canEdit}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              data={dashboardData}
              facilities={facilities}
              userRole={role}
              activeOrgId={activeOrg?.id}
            />
          )}

          {activeTab === 'assistant' && (
            <AssistantView activeOrgId={activeOrg?.id} />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionView userRole={role} activeOrgId={activeOrg?.id} />
          )}

          {activeTab === 'audit' && (
            <AuditLogsView
              logs={auditLogs}
            />
          )}
        </main>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onSuccess={() => {
            setShowAuthModal(false);
            initSession();
          }}
        />
      )}
    </div>
  );
}
