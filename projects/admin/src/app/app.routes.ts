import { Routes } from '@angular/router';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { RosterComponent } from './components/roster/roster.component';

export const routes: Routes = [
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
    }
    // Add other admin routes here
];
