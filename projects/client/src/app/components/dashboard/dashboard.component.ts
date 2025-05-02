import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Driver } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  driverName: string = 'Vlad'; // Default name if not provided
  driverData: Driver | null = null;
  
  constructor(private router: Router) { }

  ngOnInit(): void {
    // Check if we have driver data from login
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        this.driverData = JSON.parse(savedDriverData) as Driver;
        if (this.driverData && this.driverData.name) {
          this.driverName = this.driverData.name;
        }
      } catch (e) {
        console.error('Error parsing saved driver data', e);
      }
    }
    
    // If no driver data, redirect to login
    if (!this.driverData) {
      this.router.navigate(['/login']);
    }
  }

  logout(): void {
    // Clear saved driver data
    localStorage.removeItem('loggedInDriver');
    // Redirect to login page
    this.router.navigate(['/login']);
  }
}
