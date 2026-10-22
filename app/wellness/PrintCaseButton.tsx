"use client";

import styles from "./wellness.module.css";

export default function PrintCaseButton() {
  return (
    <button className={styles.printButton} type="button" onClick={() => window.print()}>
      พิมพ์ / บันทึก PDF
    </button>
  );
}
