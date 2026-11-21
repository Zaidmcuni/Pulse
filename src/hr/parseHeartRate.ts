/**
 * Owner: Mohamed
 * Purpose: Parse a 0x2A37 Heart Rate Measurement packet (8-bit or 16-bit per flags bit 0)
 * FRs: FR-05
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

// Flags bit 0: 0 = uint8 heart rate at byte 1, 1 = uint16 little-endian at bytes 1-2 (Bluetooth 0x2A37).
const FLAG_HR_UINT16 = 0x01;

export function parseHeartRate(value: DataView): number {
  if (value.byteLength < 2) throw new Error("Heart rate packet too short");
  const is16 = (value.getUint8(0) & FLAG_HR_UINT16) !== 0;
  if (is16 && value.byteLength < 3) throw new Error("Heart rate packet too short");
  return is16 ? value.getUint16(1, true) : value.getUint8(1);
}
