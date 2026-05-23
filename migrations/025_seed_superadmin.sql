-- Seed: superadmin inicial (senha: GuardaAdmin@2024! — bcrypt cost 12)
-- ALTERAR SENHA E HABILITAR MFA NO PRIMEIRO LOGIN
INSERT IGNORE INTO admin_users (id, name, email, password_hash, admin_role, is_active, mfa_enabled)
VALUES (
  UUID(),
  'Administrador GuardaApp',
  'admin@guardaapp.com.br',
  '$2a$12$oT2GlyBT9jytaiRX5JlJWOxReBZkmYpaE.tBEhUX6IV2vfV3w8yEq',
  'superadmin',
  1,
  0
);
