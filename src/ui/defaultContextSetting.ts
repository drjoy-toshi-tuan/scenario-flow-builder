// ─────────────────────────────────────────────────────────────────────────────
// Bộ Context Setting mặc định cho node Start (dạng JSON). Seed vào ô nhập khi
// node chưa có giá trị — người dùng chỉnh trực tiếp trên editor JSON.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CONTEXT_SETTING = `[
  {
    "contextName": "classification",
    "contextNameJp": "区分",
    "rangeValues": [
      { "order": 1, "value": "ダミー1" },
      { "order": 2, "value": "ダミー2" }
    ],
    "displayType": "CLASSIFICATION",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "patientName",
    "contextNameJp": "患者名",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "clinicalDepartment",
    "contextNameJp": "診療科",
    "rangeValues": [
      { "order": 1, "value": "ダミー1" },
      { "order": 2, "value": "ダミー2" }
    ],
    "displayType": "DEPARTMENT",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "patientDateOfBirth",
    "contextNameJp": "生年月日",
    "rangeValues": [],
    "displayType": "DATE_OF_BIRTH",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "medicalCardNumber",
    "contextNameJp": "診察券番号",
    "rangeValues": [],
    "displayType": "NUMBER",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "reason",
    "contextNameJp": "理由",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "reservationDate",
    "contextNameJp": "現在の予約日",
    "rangeValues": [],
    "displayType": "DATE",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "additionalPhoneNumber",
    "contextNameJp": "連絡先電話番号",
    "rangeValues": [],
    "displayType": "PHONE_NUMBER",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "callId",
    "contextNameJp": "通話ID",
    "rangeValues": [],
    "displayType": "NUMBER",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  }
]
`;
