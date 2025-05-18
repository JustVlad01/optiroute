import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { StoreMatcherService } from './services/store-matcher.service';
import { ExcelImportService } from './services/excel-import.service';
import { StoreImportService } from './services/store-import.service';
import { SupabaseService } from './services/supabase.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    importProvidersFrom(FormsModule),
    provideHttpClient(),
    StoreMatcherService,
    ExcelImportService,
    StoreImportService,
    SupabaseService
  ]
};
