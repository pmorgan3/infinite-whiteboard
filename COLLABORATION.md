# Collaboration

Start the server with `pnpm --filter @whiteboard/server dev`, then start the web app. Development connects to `ws://localhost:1234`. To use another endpoint, copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_COLLAB_WS_URL`. Production builds use the page host with `ws:` or `wss:` when the variable is unset.

Join a room from the Collaboration panel or open a URL containing `?room=project-alpha`. Room IDs may contain letters, numbers, `.`, `_`, and `-`. Use `WHITEBOARD_PERSISTENCE_DIR=/safe/path` to enable server-side room persistence and `PORT` to change the server port.

## Security boundary

Collaboration has no authentication, authorization, or encryption beyond the WebSocket transport. Possession of a room URL grants read and write access. Use an unguessable room ID, serve production traffic over HTTPS/WSS, restrict the server at the network edge, and do not put secrets on a board.

## Manual two-client verification

1. Start the server and web app, join a new room, and copy its share link into a private browser window.
2. Confirm both participant names and remote cursors appear.
3. Add and edit different shapes in both windows at the same time; confirm both canvases converge without duplicates.
4. Stop the server, edit one client, restart the server, and confirm the status reconnects and the offline edit reaches both clients.
5. Leave in one client and confirm the URL parameter/presence disappear while its canvas remains editable.

Room content is in memory unless persistence is configured. There is no room administration or per-user undo.
