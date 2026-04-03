module.exports = {
  apps: [
    {
      name: "online-chess",
      cwd: "/var/www/online-chess-ir/current",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};