-- Migration 032: Sinais de integridade do dispositivo (Momentos Probatórios)
-- Ref: docs/arquitetura-diario-probatorio.md §6
--
-- Adiciona dois sinais anti-spoofing alcançáveis com as libs já instaladas (sem
-- dependência nova):
--   device_is_rooted : flag de root/jailbreak coletada no app via expo-device
--                       (Device.isRootedExperimentalAsync). Device comprometido
--                       enfraquece toda a camada L1. NULL = não foi possível determinar.
--   clock_delta_ms   : server_received_at - client_captured_at, em milissegundos.
--                       Divergência grande é indício de relógio do device adulterado.
--                       Derivado server-side; não entra no record_hash.
--
-- Compatibilidade de hash (L4): device_is_rooted entra no payload canônico SOMENTE
-- quando não-nulo (ver evidenceService.createEvidentiary). Registros anteriores, que
-- têm o campo NULL, mantêm o mesmo payload canônico e seguem verificando ÍNTEGRO.

ALTER TABLE milestone_evidence
  ADD COLUMN device_is_rooted TINYINT(1) NULL AFTER device_name,
  ADD COLUMN clock_delta_ms   INT        NULL AFTER client_timezone;
