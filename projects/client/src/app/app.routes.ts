import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DriverFormsComponent } from './components/driver-forms/driver-forms.component';
import { FormDetailsComponent } from './components/form-details/form-details.component';
import { AdminFormsComponent } from './components/admin/admin-forms/admin-forms.component';
import { FormTemplatesComponent } from './components/admin/form-templates/form-templates.component';
import { ViewOrdersComponent } from './components/view-orders/view-orders.component';
import { DriverPerformanceComponent } from './components/driver-performance/driver-performance.component';
import { StoreLibraryComponent } from './components/store-library/store-library.component';
import { DriverDeliveryUpdateComponent } from './components/driver-delivery-update/driver-delivery-update.component';
import { ReportVanIssuesComponent } from './components/report-van-issues/report-van-issues.component';

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
        path: 'driver-performance',
        component: DriverPerformanceComponent
    },
    {
        path: 'store-library',
        component: StoreLibraryComponent
    },
    {
        path: 'driver-delivery-update',
        component: DriverDeliveryUpdateComponent
    },
    {
        path: 'report-van-issues',
        component: ReportVanIssuesComponent
    },
    {
        path: 'form-details/:id',
        component: FormDetailsComponent
    },
    {
        path: 'view-orders',
        component: ViewOrdersComponent
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
