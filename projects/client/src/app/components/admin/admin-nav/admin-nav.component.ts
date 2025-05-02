import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-admin-nav',
  templateUrl: 'admin-nav.component.html',
  styleUrls: ['./admin-nav.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class AdminNavComponent {
  navItems = [
    {
      label: 'Form Assignments',
      route: '/admin/forms',
      icon: 'bi-clipboard-check'
    },
    {
      label: 'Form Templates',
      route: '/admin/form-templates',
      icon: 'bi-file-earmark-text'
    },
    {
      label: 'Drivers',
      route: '/admin/drivers',
      icon: 'bi-people'
    },
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'bi-speedometer2'
    }
  ];
} 