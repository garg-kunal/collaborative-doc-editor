/* eslint-disable @typescript-eslint/no-explicit-any */
export const throttle = (
    mainFunction: (...args: any[]) => void,
    delay: number
  ) => {
    let timerFlag: number | null = null;
    return (...args: any[]) => {
      if (timerFlag === null) {
        mainFunction(...args);
        timerFlag = setTimeout(() => {
          timerFlag = null;
        }, delay);
      }
    };
  };
  export const debounce = (
    mainFunction: (...args: any[]) => void,
    delay: number
  ) => {
    let timerFlag: number | null = null;
    return (...args: any[]) => {
      if (timerFlag) {
        clearTimeout(timerFlag);
      }
      timerFlag = setTimeout(() => {
        mainFunction(...args);
      }, delay);
    };
  };