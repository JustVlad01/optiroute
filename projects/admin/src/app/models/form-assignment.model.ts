export interface FormAssignment {
  id: string;
  driver_id: string;
  driver_name?: string;
  status: string;
  due_date: string;
  completed_at: string | null;
  form_id: string | null;
  notes: string | null;
  created_at: string;
  reset_period?: number;
  partial_form_data?: any;
  partially_completed?: boolean;
} 