import { Routes } from '@angular/router';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RosterComponent } from './components/roster/roster.component';
import { DriverFormsComponent } from './components/driver-forms/driver-forms.component';
import { FormAssignmentsComponent } from './components/form-assignments/form-assignments.component';
import { DriverDashboardComponent } from './components/driver-dashboard/driver-dashboard.component';
import { DriverFormFillComponent } from './components/driver-form-fill/driver-form-fill.component';

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
        path: 'driver-forms',
        component: DriverFormsComponent
    },
    {
        path: 'form-assignments',
        component: FormAssignmentsComponent
    },
    {
        path: 'driver-forms/view/:id',
        component: DriverFormsComponent // Reuse the same component for viewing forms
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
