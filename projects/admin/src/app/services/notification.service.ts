import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface NotificationData {
  unverifiedVanIssues: number;
  lastChecked: Date;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new BehaviorSubject<NotificationData>({
    unverifiedVanIssues: 0,
    lastChecked: new Date()
  });

  public notifications$ = this.notificationSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.loadNotifications();
    // Check for new notifications every 30 seconds
    setInterval(() => this.loadNotifications(), 30000);
  }

  async loadNotifications(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('van-issues')
        .select('id, verified')
        .eq('verified', false);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      const unverifiedCount = data?.length || 0;
      
      this.notificationSubject.next({
        unverifiedVanIssues: unverifiedCount,
        lastChecked: new Date()
      });

    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  markVanIssueAsVerified(): void {
    const current = this.notificationSubject.value;
    this.notificationSubject.next({
      ...current,
      unverifiedVanIssues: Math.max(0, current.unverifiedVanIssues - 1)
    });
  }

  getNotificationCount(): Observable<number> {
    return new Observable(observer => {
      this.notifications$.subscribe(data => {
        observer.next(data.unverifiedVanIssues);
      });
    });
  }
} 