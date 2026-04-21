export const checkCanAddDevice=(req,res,next)=>{

 if(!req.session.user){
  return res.status(401).json({success:false});
 }

 const role=req.session.user.role;

 if(role==="admin" || role==="user"){
  return next();
 }

 res.status(403).json({success:false});
};