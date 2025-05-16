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
```
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
```
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
```
{
    "message": "Login successful",
    "token": "JWT token here"
}
```
o Error(401)
```
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
```
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
```
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
```
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
```
{
    "message": "Token to reset",
    "token": "token here"
}
```
o Error(400)
```
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
```
{
  "message": "Password has been reset successfully"
}
```
o Error(400)
```
{
    "message": 'Invalid or expired token'
}
```
#######################################
### 2 Court Managament
## 2.1 Create Court
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
```
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
```
{
    "message": "Create failed"
}
```
## 2.2 Update Court
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
```
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
```
{
    "message": "Update failed"
}
```
## 2.3 Delete Court
**Endpoint**: `/api/courts/:courtId (/api/court/1) `
**Method**: DELETE
**Response
o Success (200): 
```
{
  "message": "Court deleted"
}
```
o Error(400)
```
{
    "message": "Delete failed"
}
```
## 2.4 Get all Court
**Endpoint**: `/api/courts`
**Method**: GET
**Response
o Success (200): 
```
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
```
{
    "message": "Fetch failed"
}
```
## 2.5 Get Court by ID
**Endpoint**: `/api/courts/:courtId (/api/courts/1)`
**Method**: GET
**Response
o Success (200): 
```
  {
    "id": 1,
    "name": "Court A",
    "location": "Building 1",
    "pricePerHour": 250
  }
```
o Error(500)
```
{
    "message": "Fetch failed"
}
```
## 2.6 Create Time Slot for Court
**Endpoint**: `/api/courts/:courtId/timeslots (/api/courts/1/timeslots)`
**Method**: POST
**Request Body Example**:
```json
{
  "startTime": "08:00",
  "endTime": "09:00"
}
```
**Response
o Success (201): 
```
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
```
{
    "message": "Time slot failed"
}
```
## 2.7 Get all Court
**Endpoint**: `/api/courts/:courtId/timeslots (/api/courts/1/timeslots)`
**Method**: GET
**Response
o Success (200): 
```
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
```
{
    "message": "Fetch failed"
}
```
#######################################
### 3 Booking Managament
## 3.1 Create Court
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
```
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
```
{
    "message": "Start time must be before end time" (check time booking),
    "message": 'This time slot is already booked' (overlap Booking)
}
```
## 3.2 Upload Slip
**Endpoint**: `/api/bookings/:bookingId/slip (/api/bookings/5/slip)`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
- `Form-Data: slip <file: image/png>`
**Response
o Success (200): 
```
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
```
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
```
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
```
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
```
{
  "message": "Booking approve",
  "booking": {
    "id": 5,
    "status": "APPROVE"
  }
}

```
o Error(500)
```
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
```
{
  "message": "Booking rescheduled",
  "newBooking": {
    "id": 7,
    "rescheduledFromId": 5
  }
}

```
o Error(400)
```
{
    "message": "Booking not found or unauthorize" (กรณีไม่เจอ booking)
    "message": 'You can only rescheduled once per booking' (จองได้ครั้งเดียวต่อบิล)
    "message": "Reschedule must be 3-6 hour before the original booking" (ระยะเวลาจองล่วงหน้า)
    "message": "Time slot already booked" (กัน overlap
}
```
## 3.6 Get All Bookings (ADMIN)
**Endpoint**: `/api/bookings`
**Method**: GET
**Request Headers**:  
- `Authorization: Bearer <Admin_token>`
**Response
o Success (200): 
```
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
```
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
```
{
  "message": "Booking canceled"
}

```
o Error(500)
```
{
    "message": "Cancel failed
}
```
#######################################
### 4 Payment 
## 4.1 Generate PromptPay QR Code
**Endpoint**: `/api/payments/generate-qr`
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
```
{
  "message": "QR Code generated successfully",
  "qrImage": "data:image/png;base64,iVBORw0KGgo..."
}
```
o Error(500)
```
{
    "message": "Qr generation failed
}
```
## 4.2 Read Amount From Slip (OCR)
**Endpoint**: `/api/payments/generate-qr`
**Method**: POST
**Request Headers**:  
- `Authorization: Bearer <User_token>`
**Request Body Example**:
```json
{
  "imagePath": "slip_123.jpg",
  "bookingId": 5
}
```
**Response
o Success (200): 
```
{
  "amount": 150,
  "expectedAmount": 150,
  "booking": { ... },
  "updateBooking": { ... },
  "message": "Amount read from slip and saved. Awaiting admin verification."
}
```
o Error(500)
```
{
    "message": "ORC failed
}
```
## 4.3 Approve Payment
**Endpoint**: `/api/payments/admin/verify`
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
```
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
```
{
    "message": "Verification failed
}
```
## 4.4 Reject Payment
**Endpoint**: `/api/payments/admin/reject`
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
```
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
```
{
    "message": "Rejection failed
}
```
