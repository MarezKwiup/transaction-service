import { env } from "./config/env";
import { app } from "./app";

app.listen(env.PORT, () => {
    console.log(`Listening on :${env.PORT}`);
})