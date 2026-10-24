import "dotenv/config";
import app from "./app.js";
import {db} from "./db.js";
import {seed} from "./seed.js";
import {runCompletionJob, runReminderJob, startJobs} from "./jobs.js";

if (!db.prepare("SELECT COUNT(*) n FROM users").get().n) {
  seed();
  console.log("Base vide : données de démonstration créées (mot de passe : Bookly2026!)");
}

runCompletionJob();
runReminderJob();
if (process.env.NODE_ENV !== "test") startJobs();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API Bookly sur http://localhost:${PORT}`));
