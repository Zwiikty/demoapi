# API Documentation 

## API Endpoints
#######################################
### 1 User Management 
## 1.1 Register a User
**Endpoint**: `/api/auth/register`
**Method**: POST
**Request Headers**:  
- `Content-Type: application/json`
**Request Body Example**:
```json
{
  "username": "johndoe",
  "email": "johndoe@example.com",
  "password": "password123"
} 
```
**Response
o Success (201): 
```json
{
    "message": "Register successful",
    "user": {
        "id": 4,
        "firstName": "golf",
        "lastName": "ii",
        "email": "golf@example.com",
        "role": "CUSTOMER"
    }
}
```
o Error(400)
```json
{
    "message": "Email is already registered"
}
```
## 1.2 Login a User
*Endpoint**: `/api/auth/login`
**Method**: POST
**Request Headers**:  
- `Content-Type: application/json`
**Request Body Example**:
```json
{
  "email": "golf@example.com",
  "password": "password123"
}
```
**Response
o Success (200): 
```json
{
    "message": "Login successful",
    "token": "JWT token here"
}
```
o Error(401)
```json
{
    "message": "Invalid token"
}
```
## 1.3 Logout
*Endpoint**: `/api/auth/logout`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <token>`
**Response
o Success (200): 
```json
{
  "message": "Logout successful"
}
```
## 1.4 Route Admin Page
*Endpoint**: `/api/auth/admin`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <admin_token>`
**Response
o Success (200): 
```json
{
    "message": "Welcome Admin",
    "user": {
        "id": 1,
        "firstName": "Admin",
        "role": "ADMIN",
        ...
    }
}
```
## 1.5 Route Customer Page
*Endpoint**: `/api/auth/customer`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <customer_token>`
**Response
o Success (200): 
```json
{
    "message": "Welcome customer",
    "user": {
        "id": 1,
        "firstName": "customer",
        "role": "CUSTOMER",
        ...
    }
}
```
## 1.6 Forget Password
*Endpoint**: `/api/auth/forget-password`
**Method**: POST
**Request Body Example**:
```json
{
  "email": "user@example.com"
}

```
**Response
o Success : 
```json
{
    "message": "Token to reset",
    "token": "token here"
}
```
o Error(400)
```json
{
    "message": "user not found"
}
```
## 1.7 Reset Password
*Endpoint**: `/api/auth/reset-password`
**Method**: POST
**Request Body Example**:
```json
{
  "token": "<token>",
  "newPassword": "newpassword123"
}

```
**Response
o Success : 
```json
{
  "message": "Password has been reset successfully"
}
```
o Error(400)
```json
{
    "message": 'Invalid or expired token'
}
```
## 1.8 Who am i
*Endpoint**: `/api/auth/whoami`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <token>`
**Response
o Success (200): 
```json
{
    "name": "ice sun",
    "email": "ice@example.com",
    "phone": "1234567890"
}
```
o Error(500)
```json
{
    "message": "failed to fetch user info"
}
```
## 1.9 Update Profile
*Endpoint**: `/api/auth/update-profile`
**Method**: PUT
**Request Body Example**:
- `Authorization: Bearer <token>`
```json
{
  "firstName": "PP",
  "lastName": "AI",
  "phone": "000000009"
}
```
**Response
o Success (200): 
```json
{
    "message": "User profile updated successfully",
    "user": {
        "id": 0,
        "firstName": "PP",
        "lastName": "AI",
        "phone": "000000009",
        "email": "ice@example.com",
        "updatedAt": "2025-07-24T12:43:55.619Z"
    }
}

```
o Error(500)
```json
{
    "message": "Update failed"
}
```
#######################################
### 2 Court Managament
## 2.1 Create Court (IO)
**Endpoint**: `/api/courts`
**Method**: POST
**Request Headers**:  
- `Content-Type: application/json`
**Request Body Example**:
```json
{
  "name": "Court A",
  "location": "Building 1",
  "pricePerHour": 250
}

```
**Response
o Success (201): 
```json
{
  "message": "Court created",
  "court": {
    "id": 1,
    "name": "Court A",
    "location": "Building 1",
    "pricePerHour": 250
  }
}

```
o Error(400)
```json
{
    "message": "Create failed"
}
```
## 2.2 Update Court (IO)
**Endpoint**: `/api/courts/:courtId (/api/court/1) `
**Method**: POST
**Request Headers**:  
- `Content-Type: application/json`
**Request Body Example**:
```json
{
  "name": "Court A1",
  "location": "Building 1 - Floor 2",
  "pricePerHour": 300
}
```
**Response
o Success (200): 
```json
{
  "message": "Court updated",
  "court": {
    "id": 1,
    "name": "Court A1",
    ...
  }
}
```
o Error(400)
```json
{
    "message": "Update failed"
}
```
## 2.3 Delete Court (IO)
**Endpoint**: `/api/courts/:courtId (/api/court/1) `
**Method**: DELETE
**Response
o Success (200): 
```json
{
  "message": "Court deleted"
}
```
o Error(400)
```json
{
    "message": "Delete failed"
}
```
## 2.4 Get all Court
**Endpoint**: `/api/courts`
**Method**: GET
**Response
o Success (200): 
```json
[
  {
    "id": 1,
    "name": "Court A",
    "location": "Building 1",
    "pricePerHour": 250
  },
  ...
]
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 2.5 Get Court by ID
**Endpoint**: `/api/courts/:courtId (/api/courts/1)`
**Method**: GET
**Response
o Success (200): 
```json
  {
    "id": 1,
    "name": "Court A",
    "location": "Building 1",
    "pricePerHour": 250
  }
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 2.6 Create Time Slot for Court (IO)
**Endpoint**: `/api/courts/:courtId/timeslots (/api/courts/1/timeslots)`
**Method**: POST
**Request Body Example**:
```json
{
    "date": "2025-06-8",
    "startHour": 8,
    "endHour": 22
}
```
**Response
o Success (201): 
```json
{
  "message": "Time slot created",
  "timeSlot": {
    "id": 1,
    "courtId": 1,
    "startTime": "2025-01-01T08:00:00.000Z",
    "endTime": "2025-01-01T09:00:00.000Z"
  }
}
```
o Error(400)
```json
{
    "message": "Time slot failed"
}
```
## 2.7 Timeslots Status (IO)
**Endpoint**: `/api/courts/timeslots/:id/status (/api/courts/timeslots/1/status)`
**Method**: PATCH
**Request Body Example**:
```json
{
  "status": "BOOKED" (AVAILABLE,BOOKED,MAINTENANCE)
}
```
**Response
o Success (201): 
```json
{
    "message": "Time slot status updated",
    "timeSlot": {
        "id": 1,
        "courtId": 1,
        "startTime": "2025-06-12T12:00:00.000Z",
        "endTime": "2025-06-12T13:00:00.000Z",
        "status": "MAINTENANCE"
    }
}
```
o Error(400)
```json
{
    "message": "Failed to update status"
}
```
## 2.8 Get all Court
**Endpoint**: `/api/courts/:courtId/timeslots (/api/courts/1/timeslots)`
**Method**: GET
**Response
o Success (200): 
```json
[
  {
    "id": 1,
    "courtId": 1,
    "startTime": "2025-01-01T08:00:00.000Z",
    "endTime": "2025-01-01T09:00:00.000Z"
  },
  ...
]
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 2.9 Get Court Avalible
**Endpoint**: `/api/courts/available?date&startTime (date=2025-07-14&startTime=08:00)`
**select court**: `/api/courts/available?date&startTime&courtId (date=2025-07-14&startTime=08:00&courtId=1)`
**Multi select court**: `courtId=1,2,...`  
**Method**: GET
**Response
o Success (200): 
```json
[
  {
    "courts": [
        {
            "id": 1,
            "name": "สนาม 1",
            "slots": [
                {
                    "startTime": "08:00",
                    "endTime": "09:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "09:00",
                    "endTime": "10:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "10:00",
                    "endTime": "11:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "11:00",
                    "endTime": "12:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "12:00",
                    "endTime": "13:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "13:00",
                    "endTime": "14:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "14:00",
                    "endTime": "15:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "15:00",
                    "endTime": "16:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "16:00",
                    "endTime": "17:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "17:00",
                    "endTime": "18:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "18:00",
                    "endTime": "19:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "19:00",
                    "endTime": "20:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "20:00",
                    "endTime": "21:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "21:00",
                    "endTime": "22:00",
                    "status": "AVAILABLE"
                },
                {
                    "startTime": "22:00",
                    "endTime": "23:00",
                    "status": "UNAVAILABLE"
                },
                {
                    "startTime": "23:00",
                    "endTime": "00:00",
                    "status": "UNAVAILABLE"
                }
            ]
        },
        ...
    ]
}
  ...
]
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 2.10 Court Today
**Endpoint**: `api/courts/today?date&courtId (api/courts/today?date=2025-07-28&courtId=7)`
**Method**: GET
**Response
o Success (200): 
```json
[
  {
    "court": {
        "id": 7,
        "name": "สนาม 5",
        "slots": [
            {
                "startTime": "08:00",
                "endTime": "09:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "09:00",
                "endTime": "10:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "10:00",
                "endTime": "11:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "11:00",
                "endTime": "12:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "12:00",
                "endTime": "13:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "13:00",
                "endTime": "14:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "14:00",
                "endTime": "15:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "15:00",
                "endTime": "16:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "16:00",
                "endTime": "17:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "17:00",
                "endTime": "18:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "18:00",
                "endTime": "19:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "19:00",
                "endTime": "20:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "20:00",
                "endTime": "21:00",
                "status": "AVAILABLE"
            },
            {
                "startTime": "21:00",
                "endTime": "22:00",
                "status": "AVAILABLE"
            }
        ]
    }
}
]
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```

#######################################
### 3 Booking Managament
## 3.1 Create Bookings
**Endpoint**: `/api/bookings`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
**Request Body Example**:
```json
{
  "courtId": 1,
  "date": "2025-06-01",
  "startTime": "08:00",
  "endTime": "09:00"
}
```
**Response
o Success (201): 
```json
{
  "message": "Booking crated",
  "booking": {
    "id": 5,
    "userId": 1,
    "courtId": 1,
    "date": "2025-06-01T00:00:00.000Z",
    "startTime": "2025-06-01T01:00:00.000Z",
    "endTime": "2025-06-01T02:00:00.000Z"
  }
}
```
o Error(400)
```json
{
    "message": "Start time must be before end time" (check time booking),
    "message": "This time slot is already booked" (overlap Booking)
}
```
## 3.2 Upload Slip
**Endpoint**: `/api/bookings/upload-slip/:bookingId (/api/bookings/upload-slip/2)`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
- `Form-Data: slip <file: image/png>`
**Response
o Success (200): 
```json
{
  "message": "Slip uploaded",
  "booking": {
    "id": 5,
    "slipImage": "slip_5.png",
    "status": "PENDING"
  }
}

```
o Error(400)
```json
{
    "message": "No Slip image provided (No Slip image)",
    "message": "Upload failed" (Default)
}
```
## 3.3 Get my Bookings
**Endpoint**: `/api/bookings/me`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <User_token>`
**Response
o Success (200): 
```json
[
  {
    "id": 5,
    "court": {
      "id": 1,
      "name": "Court A",
      ...
    },
    "status": "PENDING",
    "startTime": "...",
    "endTime": "..."
  }
]
```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 3.4 Update Booking Status
**Endpoint**: `/api/bookings/:bookingId/status`
**Method**: PUT
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Request Body Example**:
```json
{
  "status": "APPROVE" // or "REJECTED"
}
```
**Response
o Success (200): 
```json
{
  "message": "Booking approve",
  "booking": {
    "id": 5,
    "status": "APPROVE"
  }
}

```
o Error(500)
```json
{
    "message": "Fetch failed"
}
```
## 3.5 Reschedule Booking
**Endpoint**: `/api/bookings/:bookingId/reschedule`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
** Rule
  - เลื่อนได้ครั้งเดียวต่อ booking
  - แจ้งล่วงหน้า 3-6 ชม.
**Request Body Example**:
```json
{
  "date": "2025-06-02",
  "startTime": "10:00",
  "endTime": "11:00"
}

```
**Response
o Success (201): 
```json
{
  "message": "Booking rescheduled",
  "newBooking": {
    "id": 7,
    "rescheduledFromId": 5
  }
}

```
o Error(400)
```json
{
    "message": "Booking not found or unauthorize" (กรณีไม่เจอ booking)
    "message": 'You can only rescheduled once per booking' (จองได้ครั้งเดียวต่อบิล)
    "message": "Reschedule must be 3-6 hour before the original booking" (ระยะเวลาจองล่วงหน้า)
    "message": "Time slot already booked" (กัน overlap)
}
```
## 3.6 Get All Bookings (ADMIN)
**Endpoint**: `/api/bookings`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Response
o Success (200): 
```json
[
  {
    "id": 5,
    "user": {
      "id": 1,
      "name": "John"
    },
    "court": {
      "id": 1,
      "name": "Court A"
    },
    "status": "PENDING",
    ...
  }
]
```
o Error(500)
```json
{
    "message": "Fetch failed
}
```
## 3.7 Cancel Booking
**Endpoint**: `/api/bookings/:bookingId`
**Method**: DELETE
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Response
o Success (200): 
```json
{
  "message": "Booking canceled"
}

```
o Error(500)
```json
{
    "message": "Cancel failed
}
```
#######################################
### 4 Payment 
## 4.1 Generate PromptPay QR Code
**Endpoint**: `/api/payment/generate-qr`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
**Request Body Example**:
```json
{
  "phoneNumber": "0812345678",
  "amount": "150.00"
}
```
**Response
o Success (200): 
```json
{
  "message": "QR Code generated successfully",
  "qrImage": "data:image/png;base64,iVBORw0KGgo..." (copy all)
}
```
o Error(500)
```json
{
    "message": "Qr generation failed
}
```
## 4.2 Read Amount From Slip (OCR)
**Endpoint**: `/api/payment/generate-qr`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Request Body Example**:
```json
{
  "imagePath": "slip_123.jpg",
  "bookingId": 5
}
```
**Response
o Success (200): 
```json
{
  "amount": 150,
  "expectedAmount": 150,
  "booking": { ... },
  "updateBooking": { ... },
  "message": "Amount read from slip and saved. Awaiting admin verification."
}
```
o Error(500)
```json
{
    "message": "ORC failed
}
```
## 4.3 Approve Payment
**Endpoint**: `/api/payment/admin/verify`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Request Body Example**:
```json
{
  "bookingId": 5
}
```
**Response
o Success (200): 
```json
{
  "message": "Payment verified by admin",
  "booking": {
    "status": "APPROVE",
    "paymentVerified": true,
    "paymentConfirmedAt": "2025-05-16T12:34:56.789Z",
    ...
  }
}
```
o Error(500)
```json
{
    "message": "Verification failed
}
```
## 4.4 Reject Payment
**Endpoint**: `/api/payment/admin/reject`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Request Body Example**:
```json
{
  "bookingId": 5
}
```
**Response
o Success (200): 
```json
{
  "message": "Payment rejected by admin",
  "booking": {
    "status": "REJECTED",
    "paymentVerified": false,
    "paymentConfirmedAt": null,
    ...
  }
}
```
o Error(500)
```json
{
    "message": "Rejection failed
}
```
