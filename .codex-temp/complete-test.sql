BEGIN;
INSERT INTO section_module_item_progress (student_id, section_module_id, section_module_item_id, status, is_correct, score_percent, attempt_count, duration_seconds, submitted_payload, completed_at)
VALUES (6, 1, 1, 'completed', true, 100, 1, 30, '{}'::json, NOW());
INSERT INTO admin_audit_logs (admin_user_id, action_type, target_type, target_id, details)
VALUES (
  6,
  'student_item_completed',
  'section_module_item',
  1,
  $$ {"module_id":1,"item_type":"readable","duration_seconds":30,"actor_role":"student","actor_email":"heckerman77777@gmail.com","actor_first_name":"James","actor_last_name":"Macatangay","actor_company_name":"ABC Company"} $$::json
);
ROLLBACK;
