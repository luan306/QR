import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.post("/login",async(req,res)=>{

 const {username,password}=req.body;

 const conn = await getConnection();

 const [rows] = await conn.execute(
 "SELECT * FROM users WHERE username=? AND password=?",
 [username,password]
 );

 await conn.end();

 if(rows.length>0){

  const user = rows[0];

  req.session.user={
   id:user.id,
   username:user.username,
   role:user.role,
   department_id:user.department_id
  };

  return res.json({
   success:true,
   redirect:user.role==="admin"?"/admin":"/index"
  });
 }

 res.json({success:false,message:"Sai tài khoản"});
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
router.get("/current-user", (req, res) => {

 if (!req.session.user) {
  return res.status(401).json({
   success: false,
   message: "Chưa đăng nhập"
  });
 }

 res.json({
  success: true,
  user: req.session.user
 });

});
export default router;