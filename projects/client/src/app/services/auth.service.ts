import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor() { }

  /**
   * Get the logged in driver ID from localStorage
   */
  getLoggedInDriverId(): string {
    const loggedInDriverStr = localStorage.getItem('loggedInDriver');
    
    if (loggedInDriverStr) {
      try {
        const driver = JSON.parse(loggedInDriverStr);
        return driver.id;
      } catch (e) {
        console.error('Error parsing logged in driver data', e);
        return '';
      }
    }
    
    return '';
  }

  /**
   * Get the logged in driver name from localStorage
   */
  getLoggedInDriverName(): string {
    const loggedInDriverStr = localStorage.getItem('loggedInDriver');
    
    if (loggedInDriverStr) {
      try {
        const driver = JSON.parse(loggedInDriverStr);
        return driver.name;
      } catch (e) {
        console.error('Error parsing logged in driver data', e);
        return '';
      }
    }
    
    return '';
  }

  /**
   * Check if a driver is logged in
   */
  isLoggedIn(): boolean {
    return !!this.getLoggedInDriverId();
  }

  /**
   * Log out the current driver
   */
  logout(): void {
    localStorage.removeItem('loggedInDriver');
  }
} 