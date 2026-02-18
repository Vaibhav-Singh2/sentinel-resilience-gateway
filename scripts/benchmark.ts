import autocannon from "autocannon";

const url = "http://localhost:3000/health";

console.log(`Running benchmark against ${url}...`);

const instance = autocannon(
  {
    url,
    connections: 100, // Number of concurrent connections
    duration: 10, // Duration in seconds
    pipelining: 1, // Number of pipelined requests
  },
  (err: any, result: any) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(autocannon.printResult(result));
  },
);

autocannon.track(instance, { renderProgressBar: true });
