import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DriverFormsComponent } from './components/driver-forms/driver-forms.component';
import { FormDetailsComponent } from './components/form-details/form-details.component';
import { AdminFormsComponent } from './components/admin/admin-forms/admin-forms.component';
import { FormTemplatesComponent } from './components/admin/form-templates/form-templates.component';
import { StoreLibraryComponent } from './components/store-library/store-library.component';
import { DrivingDashboardComponent } from './components/driving-dashboard/driving-dashboard.component';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'login', // Default route
        pathMatch: 'full'
    },
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'dashboard',
        component: DashboardComponent
    },
    {
        path: 'driver-forms',
        component: DriverFormsComponent
    },
    {
        path: 'form-details/:id',
        component: FormDetailsComponent
    },
    {
        path: 'store-library',
        component: StoreLibraryComponent
    },
    {
        path: 'driving-dashboard',
        component: DrivingDashboardComponent
    },
    {
        path: 'admin/forms',
        component: AdminFormsComponent
    },
    {
        path: 'admin/form-templates',
        component: FormTemplatesComponent
    },
    {
        path: '**',
        redirectTo: 'login'
    }
];
