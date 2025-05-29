import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Around Noon';
  updateAvailable = false;
  private currentVersion: string | null = null;

  constructor(
    private swUpdate: SwUpdate,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Store the initial app version
    this.currentVersion = this.getAppVersion();
    
    // Check for service worker updates
    if (this.swUpdate.isEnabled) {
      // Check for updates immediately and then every 30 seconds
      this.checkForUpdates();
      
      // Set up periodic update checks
      interval(30000).subscribe(() => this.checkForUpdates());
      
      // Listen for version updates
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.updateAvailable = true;
          console.log('New version available. Reload the page to update.');
          
          // Auto-update after 3 seconds (give user time to see the notification)
          setTimeout(() => {
            this.updateApp();
          }, 3000);
        });

      // Handle unrecoverable state
      this.swUpdate.unrecoverable.subscribe(event => {
        console.error('Service worker in unrecoverable state:', event.reason);
        // Force reload to recover
        window.location.reload();
      });
    }

    // Also check server version periodically
    this.checkServerVersion();
    interval(60000).subscribe(() => this.checkServerVersion());
  }

  private getAppVersion(): string {
    // Try to get version from meta tag added by server
    const metaTag = document.querySelector('meta[name="build-timestamp"]');
    return metaTag?.getAttribute('content') || Date.now().toString();
  }

  private checkServerVersion() {
    this.http.get<any>('/api/version').subscribe({
      next: (versionInfo) => {
        const serverVersion = versionInfo.version?.toString();
        if (serverVersion && this.currentVersion && serverVersion !== this.currentVersion) {
          console.log('Server version changed, forcing update...');
          this.updateApp();
        }
      },
      error: (err) => {
        console.warn('Could not check server version:', err);
      }
    });
  }

  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      console.log('Checking for app updates...');
      this.swUpdate.checkForUpdate().then((hasUpdate) => {
        if (hasUpdate) {
          console.log('Update found, will be applied on next reload');
        }
      }).catch(err => {
        console.error('Error checking for updates:', err);
      });
    }
  }

  updateApp() {
    console.log('Updating app to latest version...');
    // Clear all caches before reload
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      }).finally(() => {
        // Force a hard reload to bypass all caches
        window.location.href = window.location.href + '?v=' + Date.now();
      });
    } else {
      // Fallback if Cache API is not available
      window.location.href = window.location.href + '?v=' + Date.now();
    }
  }
}
