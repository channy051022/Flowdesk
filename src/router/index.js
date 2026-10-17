import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../pages/DashboardPage.vue'),
    meta: {
      title: 'Dashboard',
      subtitle: 'Daily workflow & document routing overview',
      icon: 'LayoutDashboard'
    }
  },
  {
    path: '/finance',
    name: 'finance',
    component: () => import('../pages/FinanceMonitoringPage.vue'),
    meta: {
      title: 'Finance Monitoring',
      subtitle: 'Finance Internal Control Monitoring & Purchase Records',
      icon: 'Landmark'
    }
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../pages/MyTasksPage.vue'),
    meta: {
      title: 'My Tasks',
      subtitle: 'Priorities, official reviews & compliance deadlines',
      icon: 'CheckSquare'
    }
  },
  {
    path: '/documents',
    name: 'documents',
    component: () => import('../pages/DocumentTrackerPage.vue'),
    meta: {
      title: 'Document Tracker',
      subtitle: 'Physical paper routing slips, tracking numbers & locations',
      icon: 'FileText'
    }
  },
  {
    path: '/workflow',
    name: 'workflow',
    component: () => import('../pages/WorkflowBoardPage.vue'),
    meta: {
      title: 'Workflow Board',
      subtitle: 'Visual status of physical folders and endorsement stages',
      icon: 'Kanban'
    }
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('../pages/CalendarPage.vue'),
    meta: {
      title: 'Calendar',
      subtitle: 'Statutory deadlines, routing schedules & official calendar',
      icon: 'Calendar'
    }
  },
  {
    path: '/activity',
    name: 'activity',
    component: () => import('../pages/ActivityHistoryPage.vue'),
    meta: {
      title: 'Activity History',
      subtitle: 'Audit log of routed physical documents and action stamps',
      icon: 'History'
    }
  },
  {
    path: '/directory',
    name: 'directory',
    component: () => import('../pages/OfficeDirectoryPage.vue'),
    meta: {
      title: 'Office Directory',
      subtitle: 'Internal divisions, external offices, rooms & contacts',
      icon: 'Building2'
    }
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('../pages/ReportsPage.vue'),
    meta: {
      title: 'Reports',
      subtitle: 'Turnaround time analytics and document routing volume',
      icon: 'BarChart3'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]


const isDesktop = typeof window !== 'undefined' && (
  Boolean(window.flowdeskAPI?.isDesktop) ||
  window.location.protocol === 'file:' ||
  navigator.userAgent.toLowerCase().includes('electron')
)

const router = createRouter({
  history: isDesktop ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} — FlowDesk`
  }
})

export default router
