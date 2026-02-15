export class TimeoutError extends Error {
  constructor(message: string = "Operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out",
): Promise<T> => {
  let timeoutId: Timer;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([
    promise
      .then((result) => {
        clearTimeout(timeoutId);
        return result;
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        throw err;
      }),
    timeoutPromise,
  ]);
};

export const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  return AbortSignal.timeout(timeoutMs);
};
