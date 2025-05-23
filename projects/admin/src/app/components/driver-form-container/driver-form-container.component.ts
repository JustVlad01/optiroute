import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-driver-form-container',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './driver-form-container.component.html',
  styleUrls: ['./driver-form-container.component.scss']
})
export class DriverFormContainerComponent {
  activeTab: string = 'forms';

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Initialize active tab based on current route
    const currentUrl = this.router.url;
    if (currentUrl.includes('/assignments')) {
      this.activeTab = 'assignments';
    } else if (currentUrl.includes('/performance')) {
      this.activeTab = 'performance';
    } else if (currentUrl.includes('/updates')) {
      this.activeTab = 'updates';
    } else if (currentUrl.includes('/forms') || currentUrl === '/driver-forms') {
      this.activeTab = 'forms';
    }
  }

  navigateTo(tab: string): void {
    this.activeTab = tab;
    this.router.navigate([tab], { relativeTo: this.route });
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
} 