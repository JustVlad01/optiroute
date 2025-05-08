import { Routes } from '@angular/router';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RosterComponent } from './components/roster/roster.component';
import { DriverFormsComponent } from './components/driver-forms/driver-forms.component';
import { FormAssignmentsComponent } from './components/form-assignments/form-assignments.component';
import { DriverDashboardComponent } from './components/driver-dashboard/driver-dashboard.component';
import { DriverFormFillComponent } from './components/driver-form-fill/driver-form-fill.component';
import { DriverFormContainerComponent } from './components/driver-form-container/driver-form-container.component';
import { RoutePlannerComponent } from './components/route-planner/route-planner.component';
import { StoreMasterfileComponent } from './components/store-masterfile/store-masterfile.component';
import { ViewOrdersComponent } from './components/view-orders/view-orders.component';

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
        path: 'route-planner',
        component: RoutePlannerComponent
    },
    {
        path: 'view-orders',
        component: ViewOrdersComponent
    },
    {
        path: 'import-orders',
        redirectTo: 'route-planner?import=true',
        pathMatch: 'full'
    },
    {
        path: 'store-masterfile',
        component: StoreMasterfileComponent
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
