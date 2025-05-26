import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-driver-form-container',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './driver-form-container.component.html',
  styleUrls: ['./driver-form-container.component.scss']
})
export class DriverFormContainerComponent implements OnInit, OnDestroy {
  activeTab: string = 'forms';
  unverifiedVanIssues: number = 0;
  private notificationSubscription?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private notificationService: NotificationService
  ) {
    // Initialize active tab based on current route
    const currentUrl = this.router.url;
    if (currentUrl.includes('/assignments')) {
      this.activeTab = 'assignments';
    } else if (currentUrl.includes('/performance')) {
      this.activeTab = 'performance';
    } else if (currentUrl.includes('/updates')) {
      this.activeTab = 'updates';
    } else if (currentUrl.includes('/van-issues')) {
      this.activeTab = 'van-issues';
    } else if (currentUrl.includes('/forms') || currentUrl === '/driver-forms') {
      this.activeTab = 'forms';
    }
  }

  ngOnInit(): void {
    // Subscribe to notification updates
    this.notificationSubscription = this.notificationService.notifications$.subscribe(
      notifications => {
        this.unverifiedVanIssues = notifications.unverifiedVanIssues;
      }
    );
  }

  ngOnDestroy(): void {
    if (this.notificationSubscription) {
      this.notificationSubscription.unsubscribe();
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