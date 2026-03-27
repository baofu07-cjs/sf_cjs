#pragma once

#include <LiquidCrystal_I2C.h>

extern LiquidCrystal_I2C lcd;

static uint8_t LCD_BIG_BAR1[8] = { 0x1C, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1C };
static uint8_t LCD_BIG_BAR2[8] = { 0x07, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x07 };
static uint8_t LCD_BIG_BAR3[8] = { 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F };
static uint8_t LCD_BIG_BAR4[8] = { 0x1E, 0x1C, 0x00, 0x00, 0x00, 0x00, 0x18, 0x1C };
static uint8_t LCD_BIG_BAR5[8] = { 0x0F, 0x07, 0x00, 0x00, 0x00, 0x00, 0x03, 0x07 };
static uint8_t LCD_BIG_BAR6[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F };
static uint8_t LCD_BIG_BAR7[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x0F };
static uint8_t LCD_BIG_BAR8[8] = { 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };

inline void lcdBigDigit0(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)7);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.write((uint8_t)1);lcd.write((uint8_t)5);lcd.write((uint8_t)0);}
inline void lcdBigDigit1(int col){lcd.setCursor(col,0);lcd.print(F("  "));lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.print(F("  "));lcd.write((uint8_t)0);}
inline void lcdBigDigit2(int col){lcd.setCursor(col,0);lcd.write((uint8_t)4);lcd.write((uint8_t)2);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.write((uint8_t)1);lcd.write((uint8_t)5);lcd.write((uint8_t)5);}
inline void lcdBigDigit3(int col){lcd.setCursor(col,0);lcd.write((uint8_t)4);lcd.write((uint8_t)2);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.write((uint8_t)6);lcd.write((uint8_t)5);lcd.write((uint8_t)0);}
inline void lcdBigDigit4(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)5);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.print(F("  "));lcd.write((uint8_t)0);}
inline void lcdBigDigit5(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)2);lcd.write((uint8_t)3);lcd.setCursor(col,1);lcd.write((uint8_t)6);lcd.write((uint8_t)5);lcd.write((uint8_t)0);}
inline void lcdBigDigit6(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)2);lcd.write((uint8_t)3);lcd.setCursor(col,1);lcd.write((uint8_t)1);lcd.write((uint8_t)5);lcd.write((uint8_t)0);}
inline void lcdBigDigit7(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)7);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.print(F("  "));lcd.write((uint8_t)0);}
inline void lcdBigDigit8(int col){lcdBigDigit0(col);}
inline void lcdBigDigit9(int col){lcd.setCursor(col,0);lcd.write((uint8_t)1);lcd.write((uint8_t)2);lcd.write((uint8_t)0);lcd.setCursor(col,1);lcd.write((uint8_t)6);lcd.write((uint8_t)5);lcd.write((uint8_t)0);}

inline void lcdPrintBigDigit(uint8_t d, int col) {
  void (*const fn[10])(int) = {
    lcdBigDigit0, lcdBigDigit1, lcdBigDigit2, lcdBigDigit3, lcdBigDigit4,
    lcdBigDigit5, lcdBigDigit6, lcdBigDigit7, lcdBigDigit8, lcdBigDigit9
  };
  if (d < 10) fn[d](col);
}

inline void lcdClearBigCell(int col) {
  lcd.setCursor(col, 0);
  lcd.print(F("   "));
  lcd.setCursor(col, 1);
  lcd.print(F("   "));
}

inline void lcdInitBigDigitChars() {
  lcd.createChar(0, LCD_BIG_BAR1);
  lcd.createChar(1, LCD_BIG_BAR2);
  lcd.createChar(2, LCD_BIG_BAR3);
  lcd.createChar(3, LCD_BIG_BAR4);
  lcd.createChar(4, LCD_BIG_BAR5);
  lcd.createChar(5, LCD_BIG_BAR6);
  lcd.createChar(6, LCD_BIG_BAR7);
  lcd.createChar(7, LCD_BIG_BAR8);
}
