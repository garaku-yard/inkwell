# Outline Items Page Storage Implementation

## What Was Changed

### Database
- Created migration `003_add_pages_to_outline_items.sql` to add `start_page` and `end_page` columns to the `outline_items` table
- Added index on these columns for querying performance

### Backend (Protobuf)
- Updated `OutlineItem` message to include `start_page` and `end_page` fields
- Updated `CreateOutlineItemRequest` to include these fields
- Updated `UpdateOutlineItemRequest` to include these fields as optional

### Backend (Gateway Handlers)
- Updated `OutlineItemResponse` struct to include `StartPage` and `EndPage` fields
- Updated `transformOutlineItem` function to map these fields
- Updated `CreateOutlineItem` handler to accept and forward page fields
- Updated `UpdateOutlineItem` handler to accept and forward page fields

### Frontend (TypeScript)
- Updated `OutlineItem` interface to include `startPage` and `endPage` optional fields
- Modified `updateBeatSceneNumbers` to return calculated page numbers
- Updated `handleUpdateOutlineItem` to include page numbers when position/width changes
- Updated beat creation in lanes to calculate and send initial page numbers
- Updated beat movement between lanes to include page numbers

## Next Steps to Complete

### 1. Run Database Migration
```bash
# Apply the migration to your database
psql -d scriptlith -f server_microservices/migrations/scripts/003_add_pages_to_outline_items.sql
```

### 2. Regenerate Protobuf Files
```bash
cd server_microservices
# Regenerate the Go code from proto files
protoc --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  proto/scripts/scripts.proto
```

### 3. Update Repository Layer
Find and update the outline item repository to include the new fields:
- Update CREATE query to include `start_page, end_page`
- Update UPDATE query to handle these fields
- Update SELECT queries to retrieve these fields

### 4. Update Service Layer  
Update the scripts service to handle the new fields when creating/updating outline items.

### 5. Rebuild and Test
```bash
# Rebuild the server
cd server_microservices
go build ./cmd/server

# Test the changes
# - Create a beat and add it to a lane
# - Verify page numbers are saved in outline_items table
# - Move the beat and verify pages update
# - Resize the beat and verify pages update
```

## Benefits

1. **Page Numbers Persist**: Page ranges are now stored in the database and survive refreshes
2. **Query Capability**: Can query outline items by page range using the new index
3. **Data Integrity**: Timeline position, width, AND page numbers are all synchronized
4. **Performance**: Calculated once and stored, no need to recalculate on every read

## Files Modified

- `/server_microservices/migrations/scripts/003_add_pages_to_outline_items.sql` (NEW)
- `/server_microservices/proto/scripts/scripts.proto`
- `/server_microservices/internal/gateway/handlers/beat_board_transform.go`
- `/server_microservices/internal/gateway/handlers/beat_board.go`
- `/client/services/beat-board.ts`
- `/client/app/(private)/projects/[id]/outline-editor/page.tsx`
