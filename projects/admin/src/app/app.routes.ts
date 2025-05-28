import { Routes } from '@angular/router';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RosterComponent } from './components/roster/roster.component';
import { DriverFormsComponent } from './components/driver-forms/driver-forms.component';
import { FormAssignmentsComponent } from './components/form-assignments/form-assignments.component';
import { DriverDashboardComponent } from './components/driver-dashboard/driver-dashboard.component';
import { DriverFormFillComponent } from './components/driver-form-fill/driver-form-fill.component';
import { DriverFormContainerComponent } from './components/driver-form-container/driver-form-container.component';
import { VehicleCrateTrackingComponent } from './components/vehicle-crate-tracking/vehicle-crate-tracking.component';
import { DriverPerformanceComponent } from './components/driver-performance/driver-performance.component';
import { StoreLibraryComponent } from './components/store-library/store-library.component';
import { DriverUpdatesComponent } from './components/driver-updates/driver-updates.component';
import { DriverVanIssuesComponent } from './components/driver-van-issues/driver-van-issues.component';
import { StaffRosterManagementComponent } from './components/staff-roster-management/staff-roster-management.component';
import { ReportsComponent } from './components/reports/reports.component';

export const routes: Routes = [
    // Admin routes
    {
        path: '',
        component: DashboardComponent // Direct component rendering instead of redirect
    },
    {
        path: 'dashboard',
        component: DashboardComponent
    },
    {
        path: 'register',
        component: RegistrationComponent
    },
    {
        path: 'roster',
        component: RosterComponent
    },
    {
        path: 'import-orders',
        redirectTo: 'route-planner?import=true',
        pathMatch: 'full'
    },
    
    {
        path: 'store-library',
        component: StoreLibraryComponent
    },
    {
        path: 'staff-roster-management',
        component: StaffRosterManagementComponent
    },
    {
        path: 'vehicle-crate-tracking',
        component: VehicleCrateTrackingComponent
    },
    {
        path: 'reports',
        component: ReportsComponent
    },
    {
        path: 'driver-forms',
        component: DriverFormContainerComponent,
        children: [
            {
                path: '',
                redirectTo: 'forms',
                pathMatch: 'full'
            },
            {
                path: 'forms',
                component: DriverFormsComponent
            },
            {
                path: 'assignments',
                component: FormAssignmentsComponent
            },
            {
                path: 'performance',
                component: DriverPerformanceComponent
            },
            {
                path: 'updates',
                component: DriverUpdatesComponent
            },
            {
                path: 'van-issues',
                component: DriverVanIssuesComponent
            },
            {
                path: 'view/:id',
                component: DriverFormsComponent // Reuse the same component for viewing forms
            }
        ]
    },
    
    // Old form-assignments route for backward compatibility
    {
        path: 'form-assignments',
        redirectTo: 'driver-forms/assignments',
        pathMatch: 'full'
    },
    
    // Driver routes
    {
        path: 'driver',
        component: DriverDashboardComponent
    },
    {
        path: 'driver/fill-form/:id',
        component: DriverFormFillComponent
    }
    // Add other routes here
];
