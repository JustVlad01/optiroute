import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

// Disable debug information in production
if (environment.production) {
  (window as any).ng = {}; // Ensure ng object exists
  (window as any).ng.profiler = { timeChangeDetection: false };
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    console.error('Error during bootstrap:', err);
    
    // Display a user-friendly error rather than exposing Angular internals
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2>Application Error</h2>
        <p>Sorry, there was a problem loading the application. Please try refreshing the page.</p>
      </div>
    `;
  });
