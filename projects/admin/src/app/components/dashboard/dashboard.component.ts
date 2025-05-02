import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  constructor(private router: Router) {}
  
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
  
  logout(): void {
    // Clear saved admin data and redirect to login
    localStorage.removeItem('adminData');
    this.router.navigate(['/login']);
  }
} 