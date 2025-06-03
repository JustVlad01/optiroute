import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval, Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Around Noon';
  private destroy$ = new Subject<void>();
  private currentVersion: string | null = null;

  constructor(
    private swUpdate: SwUpdate,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.currentVersion = this.getAppVersion();
    console.log('App initialized with version:', this.currentVersion);
    
    if (this.swUpdate.isEnabled) {
      this.setupServiceWorkerUpdates();
    }

    // Check for server version updates
    this.checkServerVersion();
    // Check every 5 minutes for new versions (optimized from 1 minute)
    interval(300000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkServerVersion());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupServiceWorkerUpdates() {
    // Listen for available updates and automatically apply them
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        console.log('New version available via service worker - updating automatically');
        this.updateAppSilently();
      });

    // Handle unrecoverable state
    this.swUpdate.unrecoverable
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        console.error('Service worker in unrecoverable state:', event.reason);
        this.forceReload();
      });

    // Check for updates immediately
    this.checkForUpdates();
    
    // Check for updates every 2 minutes (optimized from 30 seconds)
    interval(120000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkForUpdates());
  }

  private getAppVersion(): string {
    // Try to get version from meta tag or use timestamp
    const versionMeta = document.querySelector('meta[name="app-version"]');
    if (versionMeta) {
      return versionMeta.getAttribute('content') || Date.now().toString();
    }
    return Date.now().toString();
  }

  private checkServerVersion() {
    console.log('Checking server version...');
    this.http.get<any>('/api/version', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }).subscribe({
      next: (versionInfo) => {
        const serverVersion = versionInfo.version?.toString();
        console.log('Server version:', serverVersion, 'Current version:', this.currentVersion);
        
        if (serverVersion && this.currentVersion && serverVersion !== this.currentVersion) {
          const serverNum = parseInt(serverVersion, 10);
          const currentNum = parseInt(this.currentVersion, 10);
          
          // Check if server version is newer (higher timestamp)
          if (!isNaN(serverNum) && !isNaN(currentNum) && serverNum > currentNum) {
            // Additional check: versions different by more than 30 seconds to avoid false positives
            if (Math.abs(serverNum - currentNum) > 30000) {
              console.log('Newer server version detected - updating automatically');
              this.updateAppSilently();
            }
          }
        }
      },
      error: (err) => {
        console.warn('Could not check server version:', err);
        // Don't show error to user, just log it
      }
    });
  }

  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().then((hasUpdate) => {
        if (hasUpdate) {
          console.log('Service worker update found - will update automatically');
        }
      }).catch(err => {
        console.error('Error checking for updates:', err);
      });
    }
  }

  // New method for silent updates
  private updateAppSilently() {
    console.log('Updating app automatically to latest version...');
    
    // First try to activate the service worker update
    if (this.swUpdate.isEnabled) {
      this.swUpdate.activateUpdate().then(() => {
        console.log('Service worker updated, reloading automatically...');
        this.clearCachesAndReload();
      }).catch((error) => {
        console.log('No service worker update available or error occurred:', error);
        this.clearCachesAndReload();
      });
    } else {
      console.log('Service worker not enabled, performing manual reload');
      this.clearCachesAndReload();
    }
  }

  private async clearCachesAndReload() {
    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }

      // Clear session storage (but keep local storage for user data)
      sessionStorage.clear();

      // Add timestamp to prevent browser caching
      const timestamp = Date.now();
      console.log('Reloading with timestamp:', timestamp);
      
      // Force reload with cache bypass
      window.location.href = window.location.pathname + '?v=' + timestamp;
    } catch (error) {
      console.error('Error clearing caches:', error);
      // Fallback to simple reload
      window.location.reload();
    }
  }

  private forceReload() {
    console.log('Force reloading due to unrecoverable service worker state');
    window.location.reload();
  }
}
