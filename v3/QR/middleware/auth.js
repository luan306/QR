export const checkAuth=(req,res,next)=>{

 if(!req.session.user){

  if(req.path.startsWith("/api")){
   return res.status(401).json({success:false,message:"Chưa đăng nhập"});
  }

  return res.redirect("/login");
 }

 next();
};