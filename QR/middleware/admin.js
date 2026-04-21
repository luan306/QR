export const checkAdmin=(req,res,next)=>{

 if(!req.session.user){
  return res.status(401).json({success:false});
 }

 if(req.session.user.role !== "admin"){
  return res.status(403).json({success:false,message:"Không có quyền"});
 }

 next();
};